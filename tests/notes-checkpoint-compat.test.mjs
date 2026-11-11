import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createPiCodeModeBridge } from "@howaboua/pi-codex-conversion/dist/adapter/code-mode/pi-tools.js";
const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { hasFreshNotes: fresh, hasPrecedingNoteWrite: preceding, NESTED_NOTE_OUTCOME } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/fresh-notes.ts");
const { NOTE_RECEIPT } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/notes.ts");
const { noteResult, NOTES_OUTPUT_SCHEMA } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/note-result.ts");
const { prepareNotesArguments } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/tool-contracts.ts");

test("Notes typed aliases normalize before schema validation and reject conflicting values", () => {
  assert.deepEqual(prepareNotesArguments({ action: "write", path: "checkpoint", content: "saved" }),
    { action: "write", path: "checkpoint", text: "saved" });
  assert.deepEqual(prepareNotesArguments({ action: "read", path: "checkpoint", start_line: 1, end_line: 2 }),
    { action: "read", path: "checkpoint", start_line: 1, stop_line: 2 });
  assert.throws(() => prepareNotesArguments({ action: "write", text: "one", content: "two" }), /Conflicting text/);
  assert.throws(() => prepareNotesArguments({ action: "read", stop_line: 2, end_line: 3 }), /Conflicting stop_line/);
});
const link = entries => entries.map((entry, i) => ({ ...entry, id: `entry-${i}`, parentId: i ? `entry-${i - 1}` : null, timestamp: "2026-11-06T00:00:00.000Z" }));
const hasFreshNotes = (entries, ...args) => fresh(link(entries), ...args);
const hasPrecedingNoteWrite = (entries, ...args) => preceding(link(entries), ...args);
const msg = message => ({ type: "message", message });
const receipt = { type: "custom", customType: NOTE_RECEIPT, data: {
  protocol: 1, sessionId: "session", windowId: "window", runId: "run",
  revision: { id: "revision", path: "checkpoint", text: "saved", mode: "replace", createdAt: 1, updatedAt: 1 },
} };
const finish = msg({ role: "assistant", content: [], stopReason: "stop" });

test("Notes accepts completed large nested saves but rejects pending and failed outcomes", () => {
  const outcome = saved => ({ type: "custom", customType: NESTED_NOTE_OUTCOME, data: {
    protocol: 1, runId: "run", windowId: "window", callId: "note", parentCallId: "cell", pending: false, saved,
  } });
  const branch = [msg({ role: "user", content: "checkpoint" }),
    msg({ role: "assistant", content: [{ type: "toolCall", id: "cell", name: "exec", arguments: {} }], stopReason: "toolUse" }),
    receipt, outcome(true),
    msg({ role: "toolResult", toolCallId: "cell", toolName: "exec", content: [], isError: false,
      nestedCalls: { complete: false, calls: [{ id: "note", name: "notes", status: "ok" }] } }), finish];
  assert.equal(hasFreshNotes(branch, "window", "run"), true, "receipt and ledger survive truncated nested arguments");
  for (const data of [{ saved: false, pending: true }, { saved: false, pending: false }]) {
    const pending = structuredClone(branch);
    Object.assign(pending[3].data, data);
    assert.equal(hasFreshNotes(pending, "window", "run"), false);
  }
  assert.equal(hasFreshNotes(branch, "other-window", "run"), false);
  assert.equal(hasFreshNotes(branch.filter(entry => entry !== receipt), "window", "run"), false);
});

test("same-group rollover requires the preceding note write to complete", () => {
  const branch = [msg({ role: "user", content: "save and roll over" }),
    msg({ role: "assistant", content: [
      { type: "toolCall", id: "save", name: "notes", arguments: { action: "write", path: "checkpoint", text: "saved" } },
      { type: "toolCall", id: "roll", name: "new_context", arguments: {} },
    ], stopReason: "toolUse" }), receipt];
  assert.equal(hasPrecedingNoteWrite(branch, "window", "run", "roll"), false);
  branch.push(msg({ role: "toolResult", toolCallId: "save", toolName: "notes", content: [], isError: false,
    details: { notesCompaction: { protocol: 1, saved: true, runId: "run" } } }));
  assert.equal(hasPrecedingNoteWrite(branch, "window", "run", "roll"), true);
  branch.at(-1).message.isError = true;
  assert.equal(hasPrecedingNoteWrite(branch, "window", "run", "roll"), false);
});

test("Notes structured results survive conversion without JSON parsing", async () => {
  const payload = { file: { path: "checkpoint", content: "saved" }, read_only: true, warnings: ["shared note"] };
  const result = noteResult(payload);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  const definition = { name: "notes", parameters: { type: "object" }, outputSchema: NOTES_OUTPUT_SCHEMA };
  const bridge = createPiCodeModeBridge({ getAllTools: () => [definition] });
  bridge.prepareLoadout({ callable: [definition], declared: [], getExposure: () => "direct", getNamespace: () => undefined });
  assert.deepEqual(await bridge.getTools()[0].invoke({}, {
    executeTool: async () => ({ result, isError: false }),
  }), { file: payload.file, warnings: payload.warnings });
});
