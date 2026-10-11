import assert from "node:assert/strict";
import test from "node:test";
import { createCodexCompactionLifecycle } from "@howaboua/pi-codex-conversion/dist/extension/compaction-lifecycle.js";
import { DEFAULT_CODEX_CONVERSION_CONFIG } from "@howaboua/pi-codex-conversion/dist/adapter/activation/config.js";

function fixture(owner) {
  const calls = [];
  const state = {
    config: structuredClone(DEFAULT_CODEX_CONVERSION_CONFIG),
    cwd: "original",
    contextTree: { handoff: { active: false } },
    ...(owner ? { externalNotes: { owner } } : {}),
  };
  const runtime = { state, finishTurn: () => calls.push("finish turn"), voice: {
    announceContextTransition: reason => calls.push(reason),
    compactionStarted: () => calls.push("voice start"),
    compactionFinished: () => calls.push("voice finish"),
  } };
  const lifecycle = createCodexCompactionLifecycle({}, runtime,
    { checkpointNotebook: async () => calls.push("checkpoint") },
    () => assert.fail("unexpected notes rollover"), () => assert.fail("unexpected refresh"));
  const ctx = { cwd: "current", model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-6-luna" },
    sessionManager: { getBranch: () => [] },
    modelRegistry: new Proxy({}, { get() { assert.fail("unexpected provider work"); } }),
    ui: { notify: message => assert.fail(message) },
  };
  const event = reason => ({ reason, branchEntries: [], signal: new AbortController().signal,
    preparation: { messagesToSummarize: [], turnPrefixMessages: [] } });
  return { state, calls, lifecycle, ctx, event };
}

test("external notes veto yields before V2 provider, checkpoint, voice or turn work", async () => {
  for (const reason of ["manual", "threshold", "overflow"]) {
    const reasons = [];
    const owner = { projectBranch: entries => entries, allowsCompaction(value) { assert.equal(this, owner); reasons.push(value); return false; } };
    const { state, calls, lifecycle, ctx, event } = fixture(owner);
    assert.equal(state.config.compaction.method, "v2");
    assert.equal(await lifecycle.beforeCompact(event(reason), ctx), undefined,
      "yield to the owner's later hook rather than cancelling its notes-only rollover");
    assert.deepEqual(reasons, [reason]);
    assert.deepEqual(calls, []);
    assert.equal(state.cwd, "original");
  }
});

test("allowing and legacy notes owners keep the ordinary compaction lifecycle", async () => {
  for (const decision of [true, undefined, "absent"]) {
    const owner = { projectBranch: entries => entries,
      ...(decision === "absent" ? {} : { allowsCompaction: () => decision }) };
    const { state, calls, lifecycle, ctx, event } = fixture(owner);
    state.config.compaction.method = "pi";
    assert.equal(await lifecycle.beforeCompact(event("manual"), ctx), undefined);
    assert.deepEqual(calls, ["finish turn", "checkpoint", "voice finish"]);
    assert.equal(state.cwd, "current");
  }
});

test("without an external owner the existing tree-handoff cancellation stays intact", async () => {
  const { state, calls, lifecycle, ctx, event } = fixture();
  state.contextTree.handoff.active = true;
  assert.deepEqual(await lifecycle.beforeCompact(event("manual"), ctx), { cancel: true });
  assert.deepEqual(calls, []);
});
