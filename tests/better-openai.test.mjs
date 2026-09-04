import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { InMemoryCredentialStore, InMemoryModelsStore } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

// Use the same TS loader as Pi, without adding another test-runner dependency.
const requireFromPi = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = requireFromPi("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const sandbox = mkdtempSync(join(tmpdir(), "better-openai-test-"));
const originalHome = process.env.HOME;
process.env.HOME = sandbox;
after(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  rmSync(sandbox, { recursive: true, force: true });
});

const { configPaths, DEFAULT_SUPPORTED_MODELS, readRawConfig, resolveConfig, writeConfig } =
  await jiti.import("../extensions/better-openai/src/config.ts");
const { registerFastCodexProvider } = await jiti.import("../extensions/better-openai/src/provider.ts");
const { default: betterOpenAI } = await jiti.import("../extensions/better-openai/index.ts");

// Representative refreshed catalog entry, not a second production model definition.
const astra = {
  id: "gpt-6-astra",
  name: "GPT-6 Astra",
  provider: "openai-codex",
  api: "openai-codex-responses",
  baseUrl: "https://chatgpt.com/backend-api",
  reasoning: true,
  input: ["text", "image"],
  contextWindow: 272000,
  maxTokens: 128000,
  cost: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  thinkingLevelMap: { off: null, minimal: "low", xhigh: "xhigh", max: "max" },
  compat: { supportsOpenAIGrammarTools: true, supportsAdditionalTools: true, supportsToolSearch: true },
};

function fixture() {
  const home = mkdtempSync(join(sandbox, "home-"));
  const cwd = join(home, "project");
  return { home, cwd, paths: configPaths(cwd, home) };
}

function captureExtension() {
  const handlers = new Map();
  const commands = new Map();
  const providers = new Map();
  const pi = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerProvider: (name, config) => providers.set(name, config),
    registerCommand: (name, command) => commands.set(name, command),
    registerFlag() {},
    registerTool() {},
    getFlag: () => false,
  };
  return {
    pi, commands, providers,
    async emit(event, payload, ctx) {
      let result;
      for (const handler of handlers.get(event) ?? []) result = await handler(payload, ctx);
      return result;
    },
  };
}

async function catalogRuntime(modelsPath = null) {
  const modelsStore = new InMemoryModelsStore();
  await modelsStore.write("openai-codex", {
    models: [astra],
    // Always newer than the bundled catalog; this test never fetches a real one.
    lastModified: Number.MAX_SAFE_INTEGER,
  });
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(), modelsStore, modelsPath,
    allowModelNetwork: false,
  });
  const captured = captureExtension();
  registerFastCodexProvider(captured.pi, () => true);
  const registration = captured.providers.get("openai-codex");
  runtime.registerProvider("openai-codex", registration);
  await runtime.refresh({ allowNetwork: false });
  return { runtime, registration, modelsStore };
}

test("bootstrapped config inherits Astra and does not freeze the allowlist", () => {
  const { cwd, home, paths } = fixture();
  const cfg = resolveConfig(cwd, home);
  assert.equal(Object.hasOwn(readRawConfig(paths.global), "supportedModels"), false);
  assert.deepEqual(cfg.supportedModels.map(({ provider, id }) => `${provider}/${id}`), DEFAULT_SUPPORTED_MODELS);
  assert.ok(DEFAULT_SUPPORTED_MODELS.includes("openai/gpt-6-astra"));
  assert.ok(DEFAULT_SUPPORTED_MODELS.includes("openai-codex/gpt-6-astra"));
  writeConfig(paths.global, { desiredActive: true, active: false });
  assert.equal(resolveConfig(cwd, home).desiredActive, true);
  assert.deepEqual(resolveConfig(cwd, home).supportedModels, cfg.supportedModels);
});

test("explicit allowlists, including empty project overrides, are respected", () => {
  const { cwd, home, paths } = fixture();
  writeConfig(paths.global, { supportedModels: ["openai/gpt-5.4"] });
  assert.deepEqual(resolveConfig(cwd, home).supportedModels, [{ provider: "openai", id: "gpt-5.4" }]);
  writeConfig(paths.project, { supportedModels: [] });
  assert.deepEqual(resolveConfig(cwd, home).supportedModels, []);
});

test("transport registration preserves refreshed Astra metadata", async () => {
  const { runtime, registration } = await catalogRuntime();
  assert.equal(Object.hasOwn(registration, "models"), false);
  assert.equal(typeof registration.streamSimple, "function");
  assert.ok(registration.oauth);
  assert.deepEqual(runtime.getModel("openai-codex", astra.id), astra);
});

test("later catalog updates remain visible through the custom transport", async () => {
  const { runtime, modelsStore } = await catalogRuntime();
  const updated = { ...astra, name: "Updated Astra metadata", contextWindow: 300000 };
  const added = { ...astra, id: "test-future-model" };
  await modelsStore.write("openai-codex", {
    models: [updated, added], lastModified: Number.MAX_SAFE_INTEGER,
  });
  await runtime.refresh({ allowNetwork: false });
  assert.deepEqual(runtime.getModel("openai-codex", astra.id), updated);
  assert.deepEqual(runtime.getModel("openai-codex", added.id), added);
});

test("explicit models.json context overrides still take precedence", async () => {
  const { home } = fixture();
  const modelsPath = join(home, "models.json");
  writeConfig(modelsPath, {
    providers: { "openai-codex": { modelOverrides: { "gpt-6-astra": { contextWindow: 1050000 } } } },
  });
  const { runtime } = await catalogRuntime(modelsPath);
  assert.equal(runtime.getModel("openai-codex", astra.id).contextWindow, 1050000);
  assert.equal(runtime.getModel("openai-codex", astra.id).thinkingLevelMap.off, null);
});

test("startup activates requested Astra fast mode; toggling off stops priority injection", async () => {
  const { cwd } = fixture();
  const paths = configPaths(cwd);
  writeConfig(paths.project, { desiredActive: true, active: false, usage: { enabled: false } });
  const captured = captureExtension();
  betterOpenAI(captured.pi);
  const notices = [];
  const ctx = {
    cwd, hasUI: false, model: astra,
    sessionManager: { getSessionId: () => "test-astra", getEntries: () => [] },
    ui: { notify: (message, level) => notices.push({ message, level }), setStatus() {} },
  };
  await captured.emit("session_start", { reason: "startup" }, ctx);
  assert.equal(notices.some(({ level }) => level === "warning"), false);
  assert.equal(readRawConfig(paths.project).active, true);
  assert.equal(Object.hasOwn(readRawConfig(paths.project), "supportedModels"), false);
  const payload = { model: astra.id, input: [] };
  assert.deepEqual(await captured.emit("before_provider_request", { payload }, ctx), {
    ...payload, service_tier: "priority",
  });
  await captured.commands.get("fast").handler("", ctx);
  assert.equal(await captured.emit("before_provider_request", { payload }, ctx), undefined);
  assert.equal(readRawConfig(paths.project).desiredActive, false);
  await captured.emit("session_shutdown", {}, ctx);
});
