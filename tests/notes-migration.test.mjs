import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { loadNotesSettings, notesSettingsPath, writeSettings } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/notes/settings.ts");

test("bundled Notes stays inactive by default and migrates explicit continuity without rewriting PCC", async t => {
  const dir = await mkdtemp(join(tmpdir(), "notes-migration-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  });
  const ctx = { cwd: join(dir, "project"), isProjectTrusted: () => false };
  const path = notesSettingsPath(), legacy = join(dir, "pi-codex-conversion.json");
  const fresh = loadNotesSettings(ctx);
  assert.equal(fresh.active, "whitelist");
  assert.deepEqual(fresh.modelWhitelist, []);
  for (const continuity of ["notes", "notes-and-compaction"]) {
    const source = JSON.stringify({ compaction: { continuity, idleNotesRollover: 15, shareSubagentContext: true } });
    await writeFile(legacy, source);
    const migrated = loadNotesSettings(ctx);
    assert.equal(migrated.active, "all");
    assert.equal(migrated.normalCompaction, continuity === "notes-and-compaction");
    assert.equal(migrated.idleMinutes, 15);
    assert.equal(migrated.shareSubagentContext, true);
    assert.equal(await readFile(legacy, "utf8"), source);
  }
  await mkdir(join(ctx.cwd, ".pi"), { recursive: true });
  await writeFile(join(ctx.cwd, ".pi/pi-codex-conversion.json"), JSON.stringify({ compaction: { continuity: "compaction" } }));
  assert.equal(loadNotesSettings(ctx).active, "all", "untrusted project cannot override global continuity");
  assert.deepEqual(loadNotesSettings({ ...ctx, isProjectTrusted: () => true }), fresh, "trusted explicit opt-out wins");
  writeSettings(path, fresh);
  assert.deepEqual(loadNotesSettings(ctx), fresh, "saved Notes settings override legacy settings");
  const off = { ...fresh, active: "off", modelWhitelist: ["retained-model"] };
  writeSettings(path, off);
  assert.deepEqual(loadNotesSettings(ctx), off, "explicit Off and saved whitelist survive migration");
});

test("Notes native database can create and read storage", () => {
  const notesRequire = createRequire(import.meta.resolve("@howaboua/pi-notes-compaction"));
  const Database = notesRequire("better-sqlite3");
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE notes (text TEXT); INSERT INTO notes VALUES ('retained')");
    assert.equal(db.prepare("SELECT text FROM notes").get().text, "retained");
  } finally { db.close(); }
});
