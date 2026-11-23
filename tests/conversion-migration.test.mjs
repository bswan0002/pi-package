import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readEffectiveCodexConversionConfig } from "@howaboua/pi-codex-conversion/dist/adapter/activation/config-store.js";
import { resolveCodexRuntimePlanForState } from "@howaboua/pi-codex-conversion/dist/adapter/activation/runtime-plan.js";

for (const [legacy, expected] of [["js", "vm"], ["notebook", "ts"], ["normal", "normal"], ["code", "code"], ["ts", "ts"]]) {
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
    assert.equal(config.scope.allProviders, "off", "removed extras scope must not enable all providers");
    assert.deepEqual(config.scope.additionalProviders, ["fixture"]);
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
    assert.equal(resolveCodexRuntimePlanForState(unrelatedModel, { config }).kind, "inactive");
    const codex = { model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-6-luna" } };
    const blocked = resolveCodexRuntimePlanForState(codex, { config, availableToolNames: [] });
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
    assert.deepEqual(trusted.scope.additionalProviders, ["project-only"]);
    assert.equal(trusted.scope.allProviders, "off");
    assert.deepEqual(JSON.parse(await readFile(projectPath, "utf8")).unrelated, { keep: true });
  });
}
