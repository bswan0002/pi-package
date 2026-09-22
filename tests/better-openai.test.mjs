import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { zstdDecompressSync } from "node:zlib";

// Use the same TypeScript loader supplied by Pi, without writing loader caches.
const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { registerFastCodexProvider } = await jiti.import("../extensions/better-openai/src/provider.ts");
const { DEFAULT_SUPPORTED_MODELS, DEFAULT_CONFIG } = await jiti.import("../extensions/better-openai/src/config.ts");
const { composeModelProvider, validateExtensionProvider } = await import(new URL("./core/provider-composer.js", import.meta.resolve("@earendil-works/pi-coding-agent")));

function setup() {
  const registrations = [];
  const handlers = new Map();
  const controller = registerFastCodexProvider({
    registerProvider: (...args) => registrations.push(args),
    on: (event, handler) => handlers.set(event, handler),
  });
  return { registrations, handlers, controller };
}

const model = { id: "gpt-6-luna", name: "GPT-6 Luna", provider: "openai-codex", api: "openai-codex-responses", baseUrl: "https://chatgpt.com/backend-api", reasoning: true, input: ["text"], cost: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }, contextWindow: 272000, maxTokens: 128000, compat: { supportsMidConvoSystemMessages: true, supportsAdditionalTools: true } };

test("upstream native registration becomes a transport-only overlay retaining live models and overrides", async () => {
  const { registrations } = setup();
  assert.equal(registrations.length, 1);
  const [id, overlay] = registrations[0];
  assert.equal(id, "openai-codex");
  assert.deepEqual(Object.keys(overlay).sort(), ["api", "streamSimple"]);
  let catalog = [model];
  const oauth = { name: "Stock auth" };
  let refreshed = false;
  const base = {
    id, getModels: () => catalog, auth: { oauth },
    refreshModels: async () => { refreshed = true; catalog = [...catalog, { ...model, id: "future-model" }]; },
  };
  const config = { modelOverrides: { [model.id]: { contextWindow: 123456 } } };
  validateExtensionProvider(id, base, config, overlay);
  const provider = composeModelProvider(id, base, { getProvider: () => config }, overlay);
  assert.equal(provider.getModels()[0].contextWindow, 123456);
  assert.ok(provider.auth.oauth);
  await provider.refreshModels({ signal: new AbortController().signal, publish: async ({ update }) => update() });
  assert.equal(refreshed, true);
  assert.equal(provider.getModels()[1].id, "future-model");
});

test("SSE preserves transcript updates and priority payload without Lite or identity overrides", async (t) => {
  const { registrations, handlers } = setup();
  const { streamSimple } = registrations[0][1];
  const tool = (name) => ({ name, description: name, parameters: { type: "object", properties: {} } });
  const context = { messages: [
    { role: "system", content: "Initial instructions", toolsAdded: [tool("first")], timestamp: 1 },
    { role: "user", content: "First question", timestamp: 2 },
    { role: "system", content: "Later instructions", toolsAdded: [tool("second")], toolsRemoved: [{ name: "first" }], timestamp: 3 },
    { role: "user", content: "Next question", timestamp: 4 },
  ] };
  const original = structuredClone(context);
  let captured;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const headers = new Headers(init.headers);
    const json = headers.get("content-encoding") === "zstd" ? zstdDecompressSync(init.body).toString() : init.body;
    captured = { headers, body: JSON.parse(json) };
    // Stop at the HTTP boundary: no real credentials, requests, or quota use.
    return new Response(JSON.stringify({ error: { message: "fixture stop" } }), { status: 400 });
  });
  const token = `test.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "fixture" } })).toString("base64url")}.test`;
  const result = await streamSimple(model, context, {
    apiKey: token, transport: "sse", maxRetries: 0,
    // Pi forwards Better OpenAI's before_provider_request result through this hook.
    onPayload: (body) => ({ ...body, service_tier: "priority" }),
  }).result();
  assert.match(result.errorMessage, /fixture stop/);
  assert.equal(captured.body.service_tier, "priority");
  assert.equal(captured.headers.get("originator"), "pi");
  assert.equal(captured.headers.has("x-codex-routing-hint"), false);
  assert.ok(!captured.body.input.some((item) => item.type === "additional_tools"));
  assert.equal(captured.body.instructions, "Initial instructions");
  assert.equal(captured.body.parallel_tool_calls, true);
  const inputs = captured.body.input.map((item) => JSON.stringify(item));
  const firstUser = inputs.findIndex((item) => item.includes("First question"));
  const update = inputs.findIndex((item) => item.includes("Later instructions"));
  const nextUser = inputs.findIndex((item) => item.includes("Next question"));
  assert.ok(firstUser >= 0 && update > firstUser && nextUser > update);
  assert.match(JSON.stringify(captured.body), /second/);
  await streamSimple(model, context, { apiKey: token, transport: "sse", maxRetries: 0 }).result();
  assert.equal(captured.body.service_tier, undefined);
  assert.equal(captured.headers.get("originator"), "pi");
  assert.deepEqual(context, original);
  assert.deepEqual(handlers.get("cache_warming_decision")({}, { model }), { action: "stop" });
  assert.equal(handlers.get("cache_warming_decision")({}, { model: { provider: "anthropic" } }), undefined);
  handlers.get("session_shutdown")();
});

test("GPT-6 defaults include both providers without persisting an allowlist snapshot", () => {
  for (const provider of ["openai", "openai-codex"]) {
    for (const tier of ["astra", "sol", "luna"]) assert.ok(DEFAULT_SUPPORTED_MODELS.includes(`${provider}/gpt-6-${tier}`));
  }
  assert.equal(DEFAULT_CONFIG.supportedModels, undefined);
});
