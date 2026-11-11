import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { appendFileSync, writeFileSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readSavedNotesSession } from "../node_modules/@howaboua/pi-notes-compaction/src/notes/saved-session.mjs";
const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { createSavedSessionAccess } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/saved-session-access.ts");
const timestamp = "2026-11-07T00:00:00.000Z";
const identity = (threadId, family = "family") => ({ type: "custom", id: "identity", parentId: null, timestamp,
  customType: "codex-context-agent", data: { protocol: 1, sessionId: family, threadId, agentName: `/${threadId}`, storage: "session" } });
const note = { type: "custom", id: "note", parentId: "identity", timestamp, customType: "notes-compaction:note:v1",
  data: { protocol: 1, sessionId: "worker", windowId: "window", runId: "run",
    revision: { id: "revision", path: "/worker/notes/checkpoint", text: "saved checkpoint", mode: "replace", createdAt: 1, updatedAt: 1 } } };
const jsonl = records => records.map(x => JSON.stringify(x)).join("\n") + "\n";
const snapshot = family => jsonl([{ type: "session", id: "worker" }, identity("worker", family), note]);

test("closed local workers resolve from saved family identity without a live parent", async t => {
  const dir = await mkdtemp(join(tmpdir(), "notes-saved-family-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "worker.jsonl");
  await writeFile(file, snapshot("family"));
  const access = createSavedSessionAccess({ sessionFile: id => id === "worker" ? file : undefined }, "notes", undefined, undefined);
  const current = { threadId: "controller", entries: [identity("controller")], branch: [] };
  const saved = await access.indexed(current, "/worker");
  assert.equal(saved.threadId, "worker");
  assert.equal(saved.branch[0].data.revision.text, "saved checkpoint");
  assert.equal(await access.indexed(current, "/missing"), undefined);
  await writeFile(file, snapshot("different-family"));
  await assert.rejects(access.indexed(current, "/worker"), /cannot access the requested saved context/);
});

test("saved-session reads retain their original snapshot when new entries append", async t => {
  const dir = await mkdtemp(join(tmpdir(), "notes-append-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "worker.jsonl");
  const appended = { type: "message", id: "later", parentId: "note", timestamp, message: { role: "user", content: "later" } };
  for (const history of [false, true]) {
    await writeFile(file, snapshot("family"));
    let checks = 0;
    // The reader's cancellation checkpoints let the fixture append after its
    // initial stat, without sleeps or timing-dependent concurrent processes.
    const signal = { throwIfAborted() { if (++checks === 2) appendFileSync(file, jsonl([appended])); } };
    const saved = await readSavedNotesSession(file, signal, history);
    assert.equal(saved.threadId, "worker");
    assert.equal(saved.branch.at(-1).id, "note");
    assert.equal((await readSavedNotesSession(file, undefined, true)).branch.at(-1).id, "later");
  }
});

test("saved-session access keeps remote-relative paths on their originating machine", async () => {
  const requests = [];
  const loader = async location => {
    requests.push(location);
    return { threadId: "worker", entries: [identity("worker")], branch: [note] };
  };
  const access = createSavedSessionAccess({ sessionFile: () => undefined }, "notes", loader, undefined);
  const remote = await access.load({ machine: "remote-fixture", sessionFile: "/sessions/worker.jsonl" });
  assert.deepEqual(access.locator(remote, "local", "/sessions/parent.jsonl"),
    { machine: "remote-fixture", sessionFile: "/sessions/parent.jsonl" });
  assert.equal(await access.indexed(remote, "/missing"), undefined, "missing local hint allows graph/remote fallback");
  assert.equal(requests.length, 1);
  const unavailable = createSavedSessionAccess({ sessionFile: () => undefined }, "notes", undefined, undefined);
  await assert.rejects(unavailable.load(requests[0]), error => error.code === "SAVED_SESSION_UNAVAILABLE");
});

test("concurrent append cannot conceal mutation of the saved prefix", async t => {
  const dir = await mkdtemp(join(tmpdir(), "notes-prefix-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "worker.jsonl"), original = snapshot("family");
  await writeFile(file, original);
  let checks = 0;
  const signal = { throwIfAborted() {
    // Mutate after the first chunk was read, before its final prefix verification.
    if (++checks === 3) writeFileSync(file, original.replace("saved checkpoint", "other checkpoint") + "\n");
  } };
  await assert.rejects(readSavedNotesSession(file, signal), /changed during the read/);
});
