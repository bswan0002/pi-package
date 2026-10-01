import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createApplyPatchTool } from "@howaboua/pi-codex-conversion";
import { registerApplyPatchDisplay } from "@howaboua/pi-codex-conversion/apply-patch-display";
// Exercise conversion's real broker, not a second local implementation of it.
import {
  registerApplyPatchDisplayBroker,
  recordApplyPatchDisplayInput,
  recordApplyPatchDisplayOutcome,
} from "@howaboua/pi-codex-conversion/dist/tools/apply-patch/display-broker.js";

function harness() {
  const bus = new EventEmitter();
  const handlers = new Map();
  const entries = [];
  const pi = {
    events: {
      on(name, fn) { bus.on(name, fn); return () => bus.off(name, fn); },
      emit(name, value) { bus.emit(name, value); },
    },
    on(name, fn) {
      const list = handlers.get(name) ?? [];
      list.push(fn);
      handlers.set(name, list);
    },
    registerEntryRenderer() {},
    appendEntry(customType, data) { entries.push({ customType, data }); },
  };
  return {
    pi, entries,
    async fire(name, event = {}) {
      for (const fn of handlers.get(name) ?? []) {
        assert.equal(await fn(event), undefined, "display must not modify tool results");
      }
    },
  };
}

const options = { customType: "test-patch-display", render: () => undefined };
const input = "*** Begin Patch\n*** Delete File: old.ts\n*** End Patch";
const details = {
  status: "success",
  result: { changedFiles: [], createdFiles: [], deletedFiles: ["old.ts"], movedFiles: [], fuzz: 0 },
};

test("display registration is inert without conversion and disposes safely", async () => {
  const h = harness();
  const registration = registerApplyPatchDisplay(h.pi, options);
  assert.equal(registration.available, false);
  await h.fire("session_shutdown");
  registration.dispose();
  assert.deepEqual(h.entries, []);
});

test("real display broker preserves direct/nested outcomes in either load order", async () => {
  for (const brokerFirst of [false, true]) {
    const h = harness();
    if (brokerFirst) registerApplyPatchDisplayBroker(h.pi);
    const registration = registerApplyPatchDisplay(h.pi, options);
    if (!brokerFirst) registerApplyPatchDisplayBroker(h.pi);
    assert.equal(registration.available, true);

    const direct = { toolName: "apply_patch", toolCallId: "direct", input: { input }, details,
      content: [{ type: "text", text: "Deleted old.ts" }], isError: false };
    const before = structuredClone(direct);
    await h.fire("tool_result", direct);
    assert.deepEqual(direct, before);
    assert.equal(h.entries.length, 0, "entry is deferred until turn end");
    await h.fire("turn_end");
    assert.equal(h.entries[0].data.source, "direct");
    assert.deepEqual(h.entries[0].data.details, details);

    const partial = { ...details, status: "partial_failure", failedTargets: ["missing.py"] };
    recordApplyPatchDisplayInput("nested", input);
    recordApplyPatchDisplayOutcome("nested", {
      details: partial, content: "Deleted old.ts; missing.py failed", error: "Recovery instructions", isError: true,
    });
    // Notebook trace results can omit details: the broker must use its execution capture.
    const trace = { id: "nested", name: "apply_patch", status: "error" };
    await h.fire("tool_result", { toolName: "exec", details: { traces: [trace] } });
    await h.fire("turn_end");
    const data = h.entries[1].data;
    assert.equal(data.source, "nested");
    assert.equal(data.isError, true);
    assert.equal(data.error, "Recovery instructions");
    assert.deepEqual(data.details, partial);
    await h.fire("tool_result", { toolName: "wait", details: { traces: [trace] } });
    await h.fire("turn_end");
    assert.equal(h.entries.length, 2, "wait must not duplicate an already displayed patch");
    await h.fire("session_shutdown");
    assert.equal(registration.available, false);
  }
});

test("old entries without snapshots remain valid", async () => {
  const h = harness();
  registerApplyPatchDisplayBroker(h.pi);
  registerApplyPatchDisplay(h.pi, options);
  await h.fire("tool_result", {
    toolName: "apply_patch", toolCallId: "delete", input: { input }, details,
    content: [{ type: "text", text: "Applied patch successfully" }], isError: false,
  });
  await h.fire("turn_end");
  // Identical for *any* former contents of old.ts. There is no lossless diff
  // adapter here: a delete patch carries a path, not the deleted source.
  assert.deepEqual(h.entries[0].data, {
    toolCallId: "delete", input, details, content: "Applied patch successfully", isError: false, source: "direct",
  });
  await h.fire("session_shutdown");
});

const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const { __testing: renderer } = await createJiti(import.meta.url, { fsCache: false }).import("../extensions/diff/index.ts");
const theme = { fg: (_role, text) => text, bold: (text) => text };
const strip = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");

test("native execution snapshots survive subsequent nested calls, deletion, moves and partial failure", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-patch-display-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const h = harness();
  registerApplyPatchDisplayBroker(h.pi);
  registerApplyPatchDisplay(h.pi, options);
  t.after(() => h.fire("session_shutdown"));
  const tool = createApplyPatchTool();
  const execute = async (id, patch, nested = false) => {
    const result = await tool.execute(id, { input: patch }, undefined, undefined, { cwd });
    assert.equal("files" in result.details, false, "display data must not change model/post-edit result details");
    if (nested) await h.fire("tool_result", { toolName: "exec", details: { traces: [{ id, name: "apply_patch", status: "success" }] } });
    else await h.fire("tool_result", { toolName: "apply_patch", toolCallId: id, input: { input: patch }, ...result, isError: false });
    return result;
  };
  await writeFile(join(cwd, "cart.ts"), "export const price = 1;\n");
  await writeFile(join(cwd, "old.py"), "def old():\n    return 42\n");
  await execute("first", "*** Begin Patch\n*** Update File: cart.ts\n@@\n-export const price = 1;\n+export const price = 2;\n*** End Patch", true);
  await execute("second", "*** Begin Patch\n*** Update File: cart.ts\n@@\n-export const price = 2;\n+export const price = 3;\n*** Delete File: old.py\n*** Add File: new.json\n+{\"enabled\": true}\n*** End Patch", true);
  assert.equal(h.entries.length, 0);
  await h.fire("turn_end");
  assert.equal(h.entries[0].data.files[0].before, "export const price = 1;\n");
  assert.equal(h.entries[0].data.files[0].after, "export const price = 2;\n");
  const deleted = h.entries[1].data.files.find((f) => f.path.endsWith("old.py"));
  assert.equal(deleted.before, "def old():\n    return 42\n");
  assert.equal(deleted.after, null);
  const added = h.entries[1].data.files.find((f) => f.path.endsWith("new.json"));
  assert.equal(added.before, null);
  assert.equal(added.after, '{"enabled": true}\n');
  await execute("move", "*** Begin Patch\n*** Update File: cart.ts\n*** Move to: renamed.ts\n@@\n export const price = 3;\n*** End Patch");
  await h.fire("turn_end");
  assert.equal(h.entries[2].data.files.find((f) => f.path.endsWith("cart.ts")).after, null);
  assert.equal(h.entries[2].data.files.find((f) => f.path.endsWith("renamed.ts")).after, "export const price = 3;\n");
  const partial = await execute("partial", "*** Begin Patch\n*** Add File: applied.ts\n+const ok = true;\n*** Update File: missing.ts\n@@\n-no\n+yes\n*** End Patch");
  assert.equal(partial.details.status, "partial_failure");
  await h.fire("turn_end");
  const last = h.entries.at(-1).data;
  assert.equal(last.isError, true);
  assert.equal(last.files.find((f) => f.path.endsWith("applied.ts")).after, "const ok = true;\n");
  assert.equal(last.files.find((f) => f.path.endsWith("missing.ts")).after, null);
  assert.match(last.content, /Recovery:/);
  // Persisted data must render without reading those files again.
  await rm(join(cwd, "renamed.ts"));
  await renderer.prepareHighlighting();
  const lines = renderer.patchDisplayComponent(h.entries[1].data, true, theme).render(80);
  assert.match(strip(lines.join("\n")), /def old/);
  assert.match(strip(lines.join("\n")), /deleted/);
  assert.match(lines.join("\n"), /\x1b\[38;2;/);
  assert.match(lines.join("\n"), /\x1b\[48;2;/);
});

test("shared Shiki display has syntax colors, real line numbers, bounded layouts and expansion", async () => {
  await renderer.prepareHighlighting();
  const before = Array.from({ length: 25 }, (_, i) => `export const item${i} = \"old\";`).join("\n") + "\n";
  const after = before.replaceAll('"old"', '"new 界 😀"');
  const data = { toolCallId: "colors", input: "", source: "nested", isError: false,
    files: [{ path: "demo.ts", before, after }, { path: "empty.py", before: null, after: "" }] };
  const collapsed = renderer.patchDisplayComponent(data, false, theme);
  const expanded = renderer.patchDisplayComponent(data, true, theme);
  const full = expanded.render(100).join("\n");
  assert.match(strip(full), /25[+-]/);
  assert.match(strip(full), /empty.py · created/);
  const codeRow = full.split("\n").find((line) => strip(line).includes("export const item0"));
  const colors = new Set(codeRow.match(/\x1b\[38;2;[0-9;]+m/g));
  assert.ok(colors.size >= 4, "code must have token colors, not just a red/green foreground");
  assert.match(strip(collapsed.render(100).join("\n")), /more lines/);
  assert.ok(expanded.render(100).length > collapsed.render(100).length);
  for (const width of [1, 4, 12, 30, 80, 160, 220]) {
    for (const component of [collapsed, expanded]) {
      const lines = component.render(width);
      assert.ok(lines.every((line) => visibleWidth(line) <= width), `overflow at ${width}`);
      component.invalidate();
      assert.deepEqual(component.render(width), lines);
    }
  }
  const failure = renderer.patchDisplayComponent({ ...data, isError: true,
    error: "Recovery: read failed.py", details: { status: "partial_failure", result: details.result, failedTargets: ["failed.py"] },
  }, false, theme).render(100).join("\n");
  assert.match(strip(failure), /partially failed/);
  assert.match(strip(failure), /Recovery: read failed.py/);
  assert.match(strip(failure), /Failed: failed.py/);
});

test("snapshot limits and failed native calls never alter execution errors", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-patch-limits-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const h = harness();
  registerApplyPatchDisplayBroker(h.pi);
  registerApplyPatchDisplay(h.pi, options);
  t.after(() => h.fire("session_shutdown"));
  await writeFile(join(cwd, "large.ts"), "x".repeat(80_001));
  const tool = createApplyPatchTool();
  const patch = "*** Begin Patch\n*** Delete File: large.ts\n*** End Patch";
  const result = await tool.execute("large", { input: patch }, undefined, undefined, { cwd });
  await h.fire("tool_result", { toolName: "apply_patch", toolCallId: "large", input: { input: patch }, ...result, isError: false });
  await h.fire("turn_end");
  assert.match(h.entries[0].data.files[0].unavailable, /size limit/);
  await assert.rejects(readFile(join(cwd, "large.ts")), { code: "ENOENT" });
  const bad = "*** Begin Patch\n*** Update File: missing.ts\n@@\n-old\n+new\n*** End Patch";
  await assert.rejects(tool.execute("failed", { input: bad }, undefined, undefined, { cwd }), /apply_patch failed/);
  await h.fire("tool_result", { toolName: "exec", details: { traces: [{ id: "failed", name: "apply_patch", status: "error" }] } });
  await h.fire("turn_end");
  assert.equal(h.entries[1].data.isError, true);
  assert.equal(h.entries[1].data.files[0].before, null);
  assert.equal(h.entries[1].data.files[0].after, null);
});
