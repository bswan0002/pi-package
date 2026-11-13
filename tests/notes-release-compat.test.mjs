import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
initTheme("dark", false);
import { openDatabase } from "../node_modules/@howaboua/pi-notes-compaction/src/notes/sqlite.mjs";
const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { NotesStore } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/store.ts");
const { openSessionPruningSettings } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/session-pruning-screen.ts");
const { SessionPruning } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/session-pruning.ts");

test("Notes does not schedule physical cleanup on reload or with pruning Off", async t => {
  const dir = await mkdtemp(join(tmpdir(), "notes-cleanup-off-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const reason of ["reload", "quit"]) {
    const handlers = new Map();
    let closed = 0;
    const store = { path: join(dir, "notes.sqlite"), close: () => closed++,
      pruningPolicy: () => {
        assert.equal(reason, "quit", "reload must not inspect or schedule cleanup");
        return { windows: 0, days: 0 };
      } };
    const pruning = new SessionPruning({ on: (name, fn) => handlers.set(name, fn) }, store, {}, () => undefined);
    pruning.register();
    await handlers.get("session_shutdown")({ reason }, {
      sessionManager: { getSessionFile: () => join(dir, "session.jsonl"), getSessionId: () => "fixture" },
      ui: { notify: message => assert.fail(message) },
    });
    assert.equal(closed, reason === "quit" ? 1 : 0);
    assert.deepEqual(await readdir(dir), [], "no cleanup worker/status/storage is created");
  }
});

test("Notes SQLite abstraction persists revisions and policies across reopen on Node", async t => {
  const dir = await mkdtemp(join(tmpdir(), "notes-sqlite-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "notes.sqlite");
  let store = new NotesStore(path);
  const revision = store.write({ id: "fixture", file: undefined }, {
    path: "state.md", text: "Retained note", mode: "replace", createdAt: 1, updatedAt: 1,
  });
  store.setPruningPolicy("fixture", { windows: 5, days: 7 });
  store.close();
  const db = openDatabase(path);
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 1);
  assert.equal(db.prepare("SELECT text FROM notes WHERE id = ?").get(revision.id).text, "Retained note");
  db.close();
  store = new NotesStore(path);
  try {
    assert.deepEqual(store.read(revision.id), revision);
    assert.equal(store.read("missing"), undefined);
    assert.deepEqual(store.pruningPolicy("fixture"), { windows: 5, days: 7 });
    assert.deepEqual(store.pruningPolicy("missing"), { windows: 0, days: 0 });
  } finally { store.close(); }
});

for (const approve of [false, true]) {
  test(`pruning menu retains its frame through preview, ${approve ? "confirmation" : "cancellation"}, and progress`, async () => {
    let component, closed = false, decision, finish;
    const theme = { fg: (_role, value) => value, bold: value => value };
    const ctx = { ui: {
      custom: async factory => { component = factory({ requestRender() {} }, theme, {}, () => { closed = true; }); },
      notify: message => assert.fail(message),
    } };
    await openSessionPruningSettings(ctx, {
      get: () => ({ windows: 0, days: 0 }), save: () => assert.fail("policy changed"),
      run: async interaction => {
        decision = await interaction.confirm("Preview fixture", "No real history will be touched");
        interaction.progress("Fixture progress");
        await new Promise(resolve => { finish = resolve; });
      },
    });
    const render = () => component.render(80).join("\n");
    component.handleInput("\x1b[B"); component.handleInput("\x1b[B"); component.handleInput("\r");
    assert.match(render(), /Session auto-pruning/);
    assert.match(render(), /Preview fixture/);
    if (approve) component.handleInput("\x1b[B");
    component.handleInput("\r");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(decision, approve);
    assert.match(render(), /Fixture progress/);
    component.handleInput("\x1b");
    assert.equal(closed, false, "busy menu cannot close or be replaced");
    finish();
    await new Promise(resolve => setImmediate(resolve));
    assert.match(render(), /Session auto-pruning/);
    assert.match(render(), /Esc back/);
    component.handleInput("\x1b");
    assert.equal(closed, true);
  });
}
