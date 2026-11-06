import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("imagegen keeps Codex access by default and persists explicit API preferences", async t => {
  const dir = await mkdtemp(join(tmpdir(), "imagegen-settings-"));
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
  const { readImagegenSettings, writeImagegenSettings } = await jiti.import("../node_modules/@howaboua/pi-codex-imagegen/src/settings.ts");
  const defaults = readImagegenSettings();
  assert.equal(defaults.access, "codex");
  const selected = { access: "openai", api: { model: "gpt-image-2.6-sunburst", quality: "high", complexity: "low" } };
  writeImagegenSettings(selected);
  assert.deepEqual(readImagegenSettings(), selected);
  assert.deepEqual(JSON.parse(await readFile(join(dir, "imagegen.json"), "utf8")), selected);
  assert.throws(() => writeImagegenSettings({ ...selected, access: "invalid" }), /Invalid imagegen/);
  assert.deepEqual(readImagegenSettings(), selected, "invalid settings cannot overwrite a valid selection");
});
