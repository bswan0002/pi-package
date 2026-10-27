import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createCodexCompactionLifecycle } from "@howaboua/pi-codex-conversion/dist/extension/compaction-lifecycle.js";
import { registerCompactionPreparation } from "@howaboua/pi-codex-conversion/compaction";
import { DEFAULT_CODEX_CONVERSION_CONFIG } from "@howaboua/pi-codex-conversion/dist/adapter/activation/config.js";

test("Notes preparation cancels before provider, checkpoint and voice work in either registration order", async () => {
  for (const first of [true, false]) {
    const bus = new EventEmitter();
    const pi = { on() {}, events: { on(name, fn) { bus.on(name, fn); return () => bus.off(name, fn); }, emit: (...args) => bus.emit(...args) } };
    let preparations = 0;
    const register = () => registerCompactionPreparation(pi, () => { preparations++; return { cancel: true }; });
    let hook = first ? register() : undefined;
    const state = { config: structuredClone(DEFAULT_CODEX_CONVERSION_CONFIG), cwd: "original" };
    const runtime = { state, suspendOrdinaryPrewarm: () => assert.fail("provider work before preparation"), voice: {} };
    const lifecycle = createCodexCompactionLifecycle(pi, runtime, { checkpointNotebook: () => assert.fail("checkpoint") }, () => {});
    hook ??= register();
    const event = { reason: "manual" };
    const ctx = { ui: { notify: () => assert.fail("notification") } };
    assert.deepEqual(await lifecycle.beforeCompact(event, ctx), { cancel: true });
    assert.deepEqual(await hook.prepare(event, ctx), { cancel: true });
    assert.equal(preparations, 1, "Pi and conversion must share one Notes preparation");
    assert.equal(state.cwd, "original");
    hook.dispose();
  }
});
