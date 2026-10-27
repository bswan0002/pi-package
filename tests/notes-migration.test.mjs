import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { readSettings, writeSettings } = await jiti.import("../node_modules/@howaboua/pi-notes-compaction/src/settings.ts");

test("bundled Notes stays inactive by default and migrates explicit continuity without rewriting PCC", async t => {
  const dir = await mkdtemp(join(tmpdir(), "notes-migration-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "notes.json"), legacy = join(dir, "conversion.json");
  const fresh = readSettings(path);
  assert.equal(fresh.active, "whitelist");
  assert.deepEqual(fresh.modelWhitelist, []);
  for (const continuity of ["notes", "notes-and-compaction"]) {
    const source = JSON.stringify({ compaction: { continuity, idleNotesRollover: 15, shareSubagentContext: true } });
    await writeFile(legacy, source);
    const migrated = readSettings(path, [legacy]);
    assert.equal(migrated.active, "all");
    assert.equal(migrated.normalCompaction, continuity === "notes-and-compaction");
    assert.equal(migrated.idleMinutes, 15);
    assert.equal(migrated.shareSubagentContext, true);
    const { readFile } = await import("node:fs/promises");
    assert.equal(await readFile(legacy, "utf8"), source);
  }
  writeSettings(path, fresh);
  assert.deepEqual(readSettings(path, [legacy]), fresh, "saved Notes settings override legacy settings");
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
