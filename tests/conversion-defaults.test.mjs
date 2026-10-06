import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_CODEX_CONVERSION_CONFIG, normalizeCodexConversionConfig } from "@howaboua/pi-codex-conversion/dist/adapter/activation/config.js";
import { readCodexConversionConfig, readEffectiveCodexConversionConfig } from "@howaboua/pi-codex-conversion/dist/adapter/activation/config-store.js";
import { resolveCodexRuntimePlan } from "@howaboua/pi-codex-conversion/dist/adapter/activation/runtime-plan.js";

test("fresh conversion installs default to Notebook and Compact V2", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-conversion-defaults-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const configPath = join(cwd, "global.json");
  const config = readCodexConversionConfig(configPath);
  assert.equal(DEFAULT_CODEX_CONVERSION_CONFIG.executionMode, "notebook");
  assert.equal(config.executionMode, "notebook");
  assert.equal(config.compaction.method, "v2");
  assert.equal(config.compaction.notesTreeHandoff, true);
  assert.equal(config.compaction.shareSubagentContext, false);
  assert.equal(normalizeCodexConversionConfig({ compaction: { notesTreeHandoff: false } }).compaction.notesTreeHandoff, false);
  assert.equal(normalizeCodexConversionConfig({}).compaction.method, "v2");
  const plan = resolveCodexRuntimePlan({ model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-6-luna" } }, config);
  assert.equal(plan.kind, "notebook");
  assert.equal(plan.nativeCompaction, true);

  // Existing explicit preferences stay authoritative; missing keys inherit defaults.
  await writeFile(configPath, JSON.stringify({ executionMode: "normal", compaction: { method: "pi" } }));
  assert.equal(readCodexConversionConfig(configPath).executionMode, "normal");
  assert.equal(readCodexConversionConfig(configPath).compaction.method, "pi");
  await writeFile(configPath, JSON.stringify({ openai: { fast: true } }));
  assert.equal(readCodexConversionConfig(configPath).executionMode, "notebook");
  assert.equal(readCodexConversionConfig(configPath).compaction.method, "v2");
  assert.deepEqual(readCodexConversionConfig(configPath).openai.fast, { astra: true, sol: true, terra: true, luna: true, other: true });

  await mkdir(join(cwd, ".pi"));
  await writeFile(join(cwd, ".pi/pi-codex-conversion.json"), JSON.stringify({ executionMode: "code", compaction: { method: "both" } }));
  const effective = (projectTrusted) => readEffectiveCodexConversionConfig({ cwd, globalConfigPath: configPath, projectTrusted, env: {} });
  assert.equal(effective(true).executionMode, "code");
  assert.equal(effective(true).compaction.method, "both");
  assert.equal(effective(false).executionMode, "notebook");
  assert.equal(effective(false).compaction.method, "v2");
});

test("Azure provider rename requires explicit conversion scope for ordinary GPT IDs", () => {
  const plan = (provider, config = DEFAULT_CODEX_CONVERSION_CONFIG, id = "gpt-5") =>
    resolveCodexRuntimePlan({ model: { provider, api: "azure-openai-responses", id } }, config);
  assert.equal(plan("azure-openai-responses").kind, "notebook");
  assert.equal(plan("azure").kind, "inactive");
  const optedIn = normalizeCodexConversionConfig({ scope: { additionalProviders: ["azure"] } });
  assert.equal(plan("azure", optedIn).kind, "notebook");
  assert.equal(plan("unrelated-provider", optedIn).kind, "inactive");
  assert.equal(plan("azure", normalizeCodexConversionConfig({ scope: { allProviders: "on" } })).kind, "notebook");
  assert.equal(plan("azure", DEFAULT_CODEX_CONVERSION_CONFIG, "gpt-5-codex").kind, "notebook");
});
