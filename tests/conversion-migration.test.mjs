import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readEffectiveCodexConversionConfig } from "@howaboua/pi-codex-conversion/dist/adapter/activation/config-store.js";
import { resolveAdapterRuntimePlanForState } from "@howaboua/pi-codex-conversion/dist/adapter/activation/runtime-plan.js";

for (const [legacy, expected] of [["js", "vm"], ["notebook", "ts"], ["normal", "vm"], ["code", "code"], ["ts", "ts"]]) {
  test(`5.1 migration preserves user fields and safely maps ${legacy} to ${expected}`, async t => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-migration-"));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const globalConfigPath = join(cwd, "global.json");
    const oldState = join(cwd, "old-notebook-state");
    await writeFile(oldState, "saved Deno checkpoint fixture");
    const original = {
      executionMode: legacy, voiceFeaturesOnly: true,
      scope: { allProviders: "extras", additionalProviders: ["fixture"] },
      tools: { applyPatchOnly: true, viewImageOnly: true, autoReasoning: false },
      ui: { compactTools: "off", codeModeDetails: true, customField: "keep" },
      prompt: { heavySystemPromptOverwrite: "gpt" },
      compaction: { method: "pi" },
      notebook: { profile: "existing", journals: "on", checkpointCleanup: "never", plainCommandOutput: false },
      openai: { harnessIdentifierHeader: false, fast: { luna: true } },
      unrelated: { whitelist: ["only-this"], value: 7 },
    };
    await writeFile(globalConfigPath, JSON.stringify(original));
    const read = projectTrusted => readEffectiveCodexConversionConfig({ cwd, globalConfigPath, projectTrusted, upgradeSettings: true, env: {} });
    const config = read(false);
    assert.equal(config.executionMode, expected);
    assert.equal(config.compaction.method, "pi");
    assert.equal(config.scope.mode, "automatic", "removed extras scope must not enable all providers");
    assert.deepEqual(config.scope.modelOverrides, {}, "legacy providers are seeded only on activation");
    assert.equal(config.ui.toolDetails, "preview");
    assert.equal(config.prompt.heavySystemPromptOverwrite, true);
    assert.equal(config.notebook.plainCommandOutput, false);
    assert.equal(config.notebook.profile, legacy === "notebook" ? undefined : "existing");
    const migrated = JSON.parse(await readFile(globalConfigPath, "utf8"));
    assert.equal(migrated.settingsVersion, 1);
    assert.deepEqual(migrated.unrelated, original.unrelated);
    assert.equal(migrated.ui.customField, "keep");
    assert.equal(migrated.voiceFeaturesOnly, undefined);
    assert.equal(migrated.tools.applyPatchOnly, undefined);
    assert.equal(migrated.tools.viewImageOnly, undefined);
    assert.equal(migrated.openai.harnessIdentifierHeader, undefined);
    assert.equal(migrated.notebook.journals, undefined);
    assert.equal(migrated.notebook.checkpointCleanup, undefined);
    assert.equal(await readFile(oldState, "utf8"), "saved Deno checkpoint fixture");
    const once = await readFile(globalConfigPath, "utf8");
    read(false);
    assert.equal(await readFile(globalConfigPath, "utf8"), once, "migration is idempotent");

    const unrelatedModel = { model: { provider: "unrelated", api: "openai-responses", id: "fixture" } };
    assert.equal(resolveAdapterRuntimePlanForState(unrelatedModel, { config }).kind, "inactive");
    const codex = { model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-6-luna" } };
    const blocked = resolveAdapterRuntimePlanForState(codex, { config, availableToolNames: [] });
    assert.equal(blocked.kind, "inactive");
    assert.deepEqual(blocked.toolNames, []);
    assert.ok(blocked.missingToolNames.length, "migration cannot bypass host tool allowlists");

    await mkdir(join(cwd, ".pi"));
    const projectPath = join(cwd, ".pi/pi-codex-conversion.json");
    const project = JSON.stringify({ executionMode: "js", compaction: { method: "both" }, scope: { allProviders: "off", additionalProviders: ["project-only"] }, unrelated: { keep: true } });
    await writeFile(projectPath, project);
    assert.equal(read(false).executionMode, expected);
    assert.equal(await readFile(projectPath, "utf8"), project, "untrusted settings are not rewritten");
    const trusted = read(true);
    assert.equal(trusted.executionMode, "vm");
    assert.equal(trusted.compaction.method, "both");
    assert.deepEqual(JSON.parse(await readFile(projectPath, "utf8")).scope.additionalProviders, ["project-only"]);
    assert.equal(trusted.scope.mode, "automatic");
    assert.deepEqual(JSON.parse(await readFile(projectPath, "utf8")).unrelated, { keep: true });
  });
}

test("legacy provider opt-in seeds only the activating model and respects explicit rules and project trust", async t => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-model-scope-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const globalConfigPath = join(cwd, "global.json");
  await mkdir(join(cwd, ".pi"));
  const projectPath = join(cwd, ".pi/pi-codex-conversion.json");
  const model = { provider: "fixture", api: "openai-responses", id: "gpt-5" };
  const read = projectTrusted => readEffectiveCodexConversionConfig({ cwd, globalConfigPath, projectTrusted, activatingModel: model, upgradeSettings: true, env: {} });
  const original = { settingsVersion: 1, executionMode: "normal", compaction: { method: "v2" },
    scope: { allProviders: "off", additionalProviders: ["fixture"] }, unrelated: "preserved" };
  await writeFile(globalConfigPath, JSON.stringify(original));
  const config = read(false);
  assert.equal(config.executionMode, "vm");
  assert.equal(config.compaction.method, "v2");
  assert.deepEqual(config.scope.modelOverrides, { fixture: { "gpt-5": true } });
  assert.equal(resolveAdapterRuntimePlanForState({ model }, { config }).kind, "vm");
  assert.equal(resolveAdapterRuntimePlanForState({ model: { ...model, id: "other" } }, { config }).kind, "inactive");
  const saved = await readFile(globalConfigPath, "utf8");
  assert.equal(JSON.parse(saved).unrelated, "preserved");
  read(false);
  assert.equal(await readFile(globalConfigPath, "utf8"), saved);
  for (const rule of [false, null]) {
    await writeFile(globalConfigPath, JSON.stringify({ ...original, scope: { ...original.scope, modelOverrides: { fixture: { "gpt-5": rule } } } }));
    assert.equal(read(false).scope.modelOverrides.fixture["gpt-5"], rule);
    assert.equal(resolveAdapterRuntimePlanForState({ model }, { config: read(false) }).kind, "inactive");
  }
  await writeFile(globalConfigPath, JSON.stringify({ ...original, scope: { ...original.scope, mode: "selected" } }));
  assert.deepEqual(read(false).scope.modelOverrides, {}, "selected mode cannot seed a legacy provider opt-in");
  await writeFile(globalConfigPath, JSON.stringify(original));
  await writeFile(projectPath, JSON.stringify({ scope: { additionalProviders: [] } }));
  assert.deepEqual(read(true).scope.modelOverrides, {}, "trusted empty project list shadows global legacy list");
  assert.deepEqual(read(false).scope.modelOverrides, { fixture: { "gpt-5": true } }, "untrusted project cannot change global scope");
});
