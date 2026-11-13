import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

test("inactive Notes defers runtime startup and explicit Off preserves saved data", async t => {
  const dir = await mkdtemp(join(tmpdir(), "notes-inactive-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  });
  const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
  const { createJiti } = require("jiti");
  const jiti = createJiti(import.meta.url, { fsCache: false });
  const { createNotesFeature } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/feature.ts");
  const { loadNotesSettings, notesSettingsPath, writeSettings } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/settings.ts");
  const ctx = { cwd: dir, model: { id: "gpt-6.1-sol" }, isProjectTrusted: () => false,
    sessionManager: { getEntries: () => [], getSessionFile: () => undefined, getSessionId: () => "fixture", getHeader: () => null }, ui: { notify: message => assert.fail(message) } };
  const start = async () => {
    const handlers = new Map(), commands = new Map();
    const feature = createNotesFeature({ on: (name, fn) => handlers.set(name, fn),
      registerCommand: (name, command) => commands.set(name, command),
      registerTool: () => assert.fail("inactive startup must not register runtime tools") });
    await handlers.get("session_start")({}, ctx);
    await handlers.get("model_select")({}, ctx);
    assert.equal(feature.enabled(), false);
    assert.ok(commands.has("notes") && commands.has("roles"));
    await handlers.get("session_shutdown")({ reason: "quit" }, ctx);
  };
  await start();
  assert.deepEqual(await readdir(join(dir, "notes-compaction")), ["settings.json"]);
  const settings = { ...loadNotesSettings(ctx), active: "off", modelWhitelist: [ctx.model.id] };
  writeSettings(notesSettingsPath(), settings);
  const saved = join(dir, "notes-compaction/notes.sqlite");
  await writeFile(saved, "saved-data-sentinel");
  await start();
  assert.equal(await readFile(saved, "utf8"), "saved-data-sentinel");
  assert.deepEqual(loadNotesSettings(ctx), settings);
});
