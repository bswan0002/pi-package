import assert from "node:assert/strict";
import test from "node:test";
import { openAICodexProviderModels } from "@howaboua/pi-codex-conversion/dist/providers/openai-codex/model-catalog.js";
import { supportsResponsesLiteModel } from "@howaboua/pi-codex-conversion/dist/providers/openai-codex/responses-lite-model.js";

test("Codex subscription catalog offers GPT-6.2 Astra and Sol over Responses Lite", () => {
  const models = openAICodexProviderModels();
  for (const [id, contextWindow] of [["gpt-6.2-astra", 272_000], ["gpt-6.2-sol", 500_000]]) {
    const matches = models.filter(model => model.id === id);
    assert.equal(matches.length, 1, id);
    const [model] = matches;
    assert.equal(model.provider, "openai-codex");
    assert.equal(model.api, "openai-codex-responses");
    assert.equal(model.contextWindow, contextWindow);
    assert.equal(model.thinkingLevelMap.off, null);
    assert.ok(supportsResponsesLiteModel(model));
  }
});
