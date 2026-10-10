import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { DEFAULT_CODEX_CONVERSION_CONFIG } from "@howaboua/pi-codex-conversion/dist/adapter/activation/config.js";
import { registerCodeModeProxyProvider } from "@howaboua/pi-codex-conversion/dist/providers/code-mode-proxy-provider.js";

// Replacing this registration loses Pi's native catalog and reasoning constraints.
test("context history preserves the native Codex provider while overlaying configured Responses", () => {
  for (const historyStorage of ["local", "tree", "remote"]) {
    for (const executionMode of ["normal", "code", "notebook"]) {
      const config = structuredClone(DEFAULT_CODEX_CONVERSION_CONFIG);
      config.compaction.continuity = "notes";
      config.compaction.historyStorage = historyStorage;
      config.scope.additionalProviders = ["fixture"];
      const registered = [];
      const pi = { registerProvider: name => registered.push(name), unregisterProvider: () => assert.fail("unexpected removal") };
      const native = { api: "openai-codex-responses", streamSimple: () => {}, models: [{ id: "gpt-6-luna" }] };
      const registry = {
        getAll: () => [
          { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-6-luna" },
          { provider: "fixture", api: "openai-responses", id: "gpt-6-luna" },
        ],
        getRegisteredProviderConfig: name => name === "openai-codex" ? native : undefined,
        getProvider: () => ({ streamSimple: () => {} }),
      };
      const proxy = registerCodeModeProxyProvider(pi, () => config, () => executionMode);
      proxy.applyConfig(config, registry);
      assert.ok(!registered.includes("openai-codex"), `${historyStorage}/${executionMode}`);
      if (historyStorage !== "remote") assert.deepEqual(registered, ["fixture"]);
      assert.equal(registry.getRegisteredProviderConfig("openai-codex"), native);
    }
  }
});

const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
for (const companion of ["pi-codex-imagegen", "pi-codex-web-run"]) {
  test(`${companion} redacts backend details while preserving failure guidance`, async () => {
    const { codexProviderFailure } = await jiti.import(`../node_modules/@howaboua/${companion}/src/codex-runtime/auth-diagnostics.ts`);
    for (const [failure, expected] of [
      ["timeout", /timed out/],
      ["429 quota", /quota or rate limit/],
      ["503 server", /service failed/],
      ["socket", /connection failed/],
      ["invalid token", /authentication unavailable/],
      ["unexpected", /request failed/],
    ]) {
      const error = codexProviderFailure(new Error(`${failure}: https://private.example/path raw-secret-value`), false);
      assert.match(error.message, expected);
      assert.doesNotMatch(error.message, /private\.example|raw-secret-value/);
    }
  });
}

test("empty notebook calls return help without starting the runtime", async () => {
  const { registerNotebookTool } = await import("@howaboua/pi-codex-conversion/dist/tools/code-mode/notebook-tool.js");
  let tool;
  registerNotebookTool({ registerTool: value => { tool = value; } }, new Proxy({}, {
    get() { assert.fail("help must not access the notebook runtime"); },
  }));
  for (const input of [{}, { input: "help" }]) {
    const result = await tool.execute("help", input);
    assert.deepEqual(result.details, { action: "help" });
    assert.match(result.content[0].text, /checkpoint/);
  }
});

test("external notes sharing preserves saved Remote provenance and validates dispatch", async () => {
  const { EventEmitter } = await import("node:events");
  const { registerContextSharingService } = await import("@howaboua/pi-codex-conversion/dist/context-management/sharing-service.js");
  const { contextAgentIdentity } = await import("@howaboua/pi-codex-conversion/dist/context-management/agent-identity.js");
  const bus = new EventEmitter();
  let service, owner;
  bus.on("pi-codex:context-sharing:available", value => { service = value; });
  const binding = { protocol: 1, threadId: "thread", sessionId: "family", agentName: "/root",
    storage: "remote", accountScope: "a".repeat(64), backendUrl: "https://fixture.invalid" };
  const ctx = { sessionManager: { getSessionId: () => "thread",
    getEntries: () => [{ type: "custom", customType: "codex-context-agent", data: binding }] } };
  const calls = [];
  registerContextSharingService({ on() {}, events: { on: (name, fn) => { bus.on(name, fn); return () => bus.off(name, fn); },
    emit: (name, value) => bus.emit(name, value) } },
    () => ({ contextManagementMode: "local", shareSubagentContext: true }),
    async (_ctx, request) => { calls.push(request); return { content: [] }; }, () => owner);
  assert.throws(() => service.describe(ctx), /requires Remote history storage/);
  owner = {};
  assert.deepEqual(service.describe(ctx), { ...binding, storage: "session" });
  assert.deepEqual(contextAgentIdentity(ctx), binding, "saved Remote identity stays available for authenticated history");
  const request = { sessionId: "family", agentName: "/root", namespace: "notes", params: { action: "list" } };
  await service.execute(ctx, request);
  assert.equal(calls.length, 1);
  await assert.rejects(() => service.execute(ctx, { ...request, agentName: "/root/other" }), /does not belong/);
  await assert.rejects(() => service.execute(ctx, { ...request, encryptedArguments: "opaque" }), /Encrypted Remote arguments/);
  assert.equal(calls.length, 1);
});
