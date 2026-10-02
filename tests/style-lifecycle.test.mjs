import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { createJiti } = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"))("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { createProjectRefresh } = await jiti.import("../extensions/style/project-refresh.ts");
const { default: registerStyle } = await jiti.import("../extensions/style/index.ts");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("refreshes coalesce and use a cwd snapshot, not a stale context", async () => {
  let active = true;
  const ctx = { get cwd() {
    assert.ok(active, "extension context is stale");
    return "/old";
  } };
  const reads = [], published = [], errors = [];
  const queue = createProjectRefresh(ctx.cwd, (cwd) => {
    assert.equal(cwd, "/old");
    const work = deferred();
    reads.push(work);
    return work.promise;
  }, (value) => published.push(value), (error) => errors.push(error));
  queue.schedule();
  queue.schedule();
  queue.schedule();
  active = false;
  reads[0].resolve("first");
  await tick();
  assert.equal(reads.length, 2);
  reads[1].resolve("second");
  await tick();
  assert.deepEqual(published, ["first", "second"]);
  assert.deepEqual(errors, []);
  queue.dispose();
});

test("shutdown discards pending work and late results without touching the replacement", async () => {
  for (const fails of [false, true]) {
    const work = deferred(), published = [], errors = [];
    let reads = 0;
    const old = createProjectRefresh("/old", () => {
      reads++;
      return work.promise;
    }, (value) => published.push(value), (error) => errors.push(error));
    old.schedule();
    old.schedule();
    old.dispose();
    const next = createProjectRefresh("/new", async (cwd) => cwd,
      (value) => published.push(value), (error) => errors.push(error));
    next.schedule();
    if (fails) work.reject(new Error("old read failed"));
    else work.resolve("old result");
    await tick();
    old.schedule();
    assert.equal(await old.refresh(), false);
    assert.equal(reads, 1);
    assert.deepEqual(published, ["/new"]);
    assert.deepEqual(errors, []);
    next.dispose();
  }
});

test("active background failures are reported and do not wedge pending refreshes", async () => {
  const work = deferred(), errors = [], published = [];
  let reads = 0;
  const queue = createProjectRefresh("/project", () => {
    reads++;
    return reads === 1 ? work.promise : Promise.resolve("recovered");
  }, (value) => published.push(value), (error) => errors.push(error));
  queue.schedule();
  queue.schedule();
  const error = new Error("read failed");
  work.reject(error);
  await tick();
  assert.deepEqual(errors, [error]);
  assert.deepEqual(published, ["recovered"]);
  assert.equal(reads, 2);
  queue.dispose();
});

test("an explicit refresh cannot publish or notify after disposal", async () => {
  const work = deferred();
  const queue = createProjectRefresh("/project", () => work.promise,
    () => assert.fail("published after disposal"), () => assert.fail("unexpected failure"));
  const result = queue.refresh();
  queue.dispose();
  work.resolve("late result");
  assert.equal(await result, false);
});

test("headless explorers never access styling UI, cwd, or session data", async () => {
  const handlers = new Map(), commands = new Map();
  registerStyle({
    on: (event, handler) => handlers.set(event, handler),
    registerCommand: (name, command) => commands.set(name, command),
  });
  const ctx = new Proxy({ hasUI: false }, {
    get(target, key) {
      if (key === "hasUI") return target.hasUI;
      assert.fail(`headless styling accessed ctx.${String(key)}`);
    },
  });
  for (const event of ["session_start", "agent_start", "message_end", "tool_execution_end",
    "model_select", "session_compact", "agent_end", "session_shutdown"]) {
    await handlers.get(event)({}, ctx);
  }
  await commands.get("pr-refresh").handler("", ctx);
  await tick();
});
