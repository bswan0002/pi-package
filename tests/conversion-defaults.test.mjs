import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_CODEX_CONVERSION_CONFIG, normalizeCodexConversionConfig } from "@howaboua/pi-codex-conversion/dist/adapter/activation/config.js";
import { readCodexConversionConfig, readEffectiveCodexConversionConfig } from "@howaboua/pi-codex-conversion/dist/adapter/activation/config-store.js";
import { resolveAdapterRuntimePlan } from "@howaboua/pi-codex-conversion/dist/adapter/activation/runtime-plan.js";

test("fresh conversion uses upstream VM Code and Pi compaction defaults", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-conversion-defaults-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const configPath = join(cwd, "global.json");
  const config = readCodexConversionConfig(configPath);
  assert.equal(DEFAULT_CODEX_CONVERSION_CONFIG.executionMode, "vm");
  assert.equal(config.executionMode, "vm");
  assert.equal(config.compaction.method, "pi");
  assert.equal(normalizeCodexConversionConfig({}).compaction.method, "pi");
  const plan = resolveAdapterRuntimePlan({ model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-6-luna" } }, config);
  assert.equal(plan.kind, "vm");
  assert.equal(plan.nativeCompaction, false);

  // Existing explicit preferences stay authoritative; missing keys inherit defaults.
  await writeFile(configPath, JSON.stringify({ executionMode: "ts", compaction: { method: "v2" } }));
  assert.equal(readCodexConversionConfig(configPath).executionMode, "ts");
  assert.equal(readCodexConversionConfig(configPath).compaction.method, "v2");
  await writeFile(configPath, JSON.stringify({ openai: { fast: true } }));
  assert.equal(readCodexConversionConfig(configPath).executionMode, "vm");
  assert.equal(readCodexConversionConfig(configPath).compaction.method, "pi");
  assert.deepEqual(readCodexConversionConfig(configPath).openai.fast, { astra: true, sol: true, terra: true, luna: true, other: true });

  await mkdir(join(cwd, ".pi"));
  await writeFile(join(cwd, ".pi/pi-codex-conversion.json"), JSON.stringify({ executionMode: "code", compaction: { method: "both" } }));
  const effective = (projectTrusted) => readEffectiveCodexConversionConfig({ cwd, globalConfigPath: configPath, projectTrusted, env: {} });
  assert.equal(effective(true).executionMode, "code");
  assert.equal(effective(true).compaction.method, "both");
  assert.equal(effective(false).executionMode, "vm");
  assert.equal(effective(false).compaction.method, "pi");
});

test("per-model scope uses exact provider/model rules and explicit Off wins over All", () => {
  const model = { provider: "azure", api: "azure-openai-responses", id: "gpt-5" };
  const plan = (config, candidate = model) => resolveAdapterRuntimePlan({ model: candidate }, normalizeCodexConversionConfig(config));
  assert.equal(plan({}).kind, "inactive");
  const selected = { scope: { mode: "selected", modelOverrides: { azure: { "gpt-5": true, "gpt-6-luna": false } } } };
  assert.equal(plan(selected).kind, "vm");
  assert.equal(plan(selected, { ...model, provider: "another" }).kind, "inactive");
  assert.equal(plan(selected, { ...model, id: "gpt-6-luna" }).kind, "inactive");
  assert.equal(plan(selected, { ...model, id: "unlisted" }).kind, "inactive");
  assert.equal(plan({ scope: { mode: "all", modelOverrides: { azure: { "gpt-5": false } } } }).kind, "inactive");
  assert.equal(plan({ scope: { mode: "all", modelOverrides: {} } }).kind, "vm");
});
