import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { RolloverRequests } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/rollover.ts");
const { NotesLifecycle } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/lifecycle.ts");
const fixture = (policy = "unrestricted") => {
  const opened = [], messages = [], warnings = [];
  const host = { active: true, windows: { current: { currentWindowId: "window" } },
    normalCompaction: false, newWindowRequests: policy };
  const ctx = { sessionManager: { getSessionId: () => "session" },
    ui: { notify: message => warnings.push(message) },
    compact: ({ onError }) => onError(new Error("Nothing to compact (session too small)")) };
  const requests = new RolloverRequests(host, async (_ctx, ...args) => opened.push(args),
    (...args) => messages.push(args), () => assert.fail("unexpected checkpoint request"));
  return { requests, ctx, host, opened, messages, warnings };
};

test("task-completion rollover is opt-in and still requires a fresh save", () => {
  const lifecycle = new NotesLifecycle({}, {});
  const ctx = { sessionManager: { getBranch: () => [] } };
  assert.throws(() => lifecycle.requestRollover(ctx, "roll", undefined, false), /disabled/);
  lifecycle.taskCompletionRollover = true;
  assert.throws(() => lifecycle.requestRollover(ctx, "roll", undefined, false), /Save your progress/);
  lifecycle.newWindowRequests = "off";
  assert.throws(() => lifecycle.requestRollover(ctx, "roll", undefined, false), /requests are disabled/);
});

for (const resume of [false, true]) test(`rollover resume=${resume} waits for settlement and preserves continuation choice`, async () => {
  const f = fixture();
  f.requests.schedule(f.ctx, undefined, resume);
  assert.deepEqual(f.opened, []);
  f.requests.outcome("completed");
  assert.deepEqual(f.opened, [], "the final reply can finish before opening a window");
  await f.requests.settled(f.ctx);
  assert.deepEqual(f.opened, [[resume, true, undefined]]);
  await f.requests.settled(f.ctx);
  assert.equal(f.opened.length, 1);
  assert.deepEqual(f.messages, []);
});

for (const outcome of ["aborted", "error", "settled-abort"]) test(`task-completion rollover cancels on ${outcome}`, async () => {
  const f = fixture();
  f.requests.schedule(f.ctx, undefined, false);
  if (outcome !== "settled-abort") f.requests.outcome(outcome);
  await f.requests.settled(f.ctx, outcome === "settled-abort");
  assert.equal(f.requests.pending, false);
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.messages, []);
});

test("task-completion rollover respects Pi eligibility without starting a successor turn", async () => {
  const f = fixture("pi-limits");
  f.requests.schedule(f.ctx, undefined, false);
  await f.requests.settled(f.ctx);
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.messages, []);
  assert.match(f.warnings[0], /current context remains/);
});

test("scheduled rollover cannot cross a changed window or session", async () => {
  for (const changed of ["window", "session"]) {
    const f = fixture();
    f.requests.schedule(f.ctx, undefined, false);
    if (changed === "window") f.host.windows.current.currentWindowId = "new-window";
    else f.ctx.sessionManager.getSessionId = () => "new-session";
    await f.requests.settled(f.ctx);
    assert.deepEqual(f.opened, []);
  }
});

test("new_context keeps the final reply running only for resume:false and forwards nested provenance", async () => {
  const { createTools } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/tools.ts");
  const calls = [];
  let aborted = 0;
  const lifecycle = { active: true, taskCompletionRollover: true,
    requestRollover: (...args) => { calls.push(args); return true; } };
  const { tools, requestContext } = createTools({ registerTool() {} }, {}, lifecycle, {},
    { onRoleIdsChanged: callback => callback([]) });
  const tool = tools.find(tool => tool.name === "new_context");
  assert.equal(tool.exposure, "model-only");
  const ctx = { abort: () => aborted++ };
  const queued = await requestContext("nested-roll", { resume: false }, undefined, ctx, "original-cell");
  assert.equal(queued.terminate, undefined);
  assert.equal(aborted, 0);
  assert.deepEqual(calls[0], [ctx, "nested-roll", undefined, false, "original-cell"]);
  const continuing = await tool.execute("direct-roll", {}, undefined, undefined, ctx);
  assert.equal(continuing.terminate, true);
  assert.equal(aborted, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(requestContext("cancelled", { resume: false }, controller.signal, ctx), /cancelled/);
  assert.equal(calls.length, 2);
});
