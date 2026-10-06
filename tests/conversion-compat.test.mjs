import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Type } from "typebox";

const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { hasCodexConversion, conversionOwnsFast } = await jiti.import("../extensions/shared/codex-conversion.ts");
const { touchedFiles } = await jiti.import("../extensions/post-edit/touched-files.ts");
const { default: postEdit } = await jiti.import("../extensions/post-edit/index.ts");
const { registerConversionFastDisplay, getFastState: fastDisplay, onFastStateChange } = await jiti.import("../extensions/shared/fast-state.ts");
const { renderCodexStatus } = await import("@howaboua/pi-codex-conversion/dist/ui/status.js");
const { syncAdapter } = await import("@howaboua/pi-codex-conversion/dist/adapter/activation/activation.js");
const { ALL_CODEX_ADAPTER_TOOL_NAMES } = await import("@howaboua/pi-codex-conversion/dist/adapter/activation/runtime-plan.js");
const { DEFAULT_CODEX_CONVERSION_CONFIG } = await import("@howaboua/pi-codex-conversion/dist/adapter/activation/config.js");
const protocol = await import("@howaboua/pi-codex-conversion/dist/tools/code-mode/preflight-protocol.js");

function harness() {
  const emitter = new EventEmitter();
  const handlers = new Map();
  const tools = [];
  const pi = {
    events: {
      on(name, handler) { emitter.on(name, handler); return () => emitter.off(name, handler); },
      emit: (name, value) => emitter.emit(name, value),
    },
    on(name, handler) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); },
    registerTool(tool) { tools.push(tool); },
    getAllTools: () => tools,
  };
  const fire = async (name, event = {}, ctx = {}) => {
    let result;
    for (const handler of handlers.get(name) ?? []) {
      const next = await handler(event, ctx);
      if (next !== undefined) result = next;
    }
    return result;
  };
  return { pi, fire, tools };
}

const codexModel = { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-6-luna" };

test("conversion fast display follows resolved state and clears on shutdown", async () => {
  const { pi, fire } = harness();
  let redraws = 0;
  const unsubscribe = onFastStateChange(() => redraws++);
  const dispose = registerConversionFastDisplay(pi);
  pi.events.emit("pi-package:codex-fast-state", { active: true, fast: true });
  assert.equal(fastDisplay().fastLabel, "fast");
  pi.events.emit("pi-package:codex-fast-state", { active: false, fast: true });
  assert.equal(fastDisplay().fastLabel, undefined);
  pi.events.emit("pi-package:codex-fast-state", { active: true, fast: true });
  pi.events.emit("pi-package:codex-fast-state", { active: "invalid", fast: false });
  assert.equal(fastDisplay().fastLabel, "fast");
  await fire("session_shutdown");
  assert.equal(fastDisplay().fastLabel, undefined);
  dispose();
  pi.events.emit("pi-package:codex-fast-state", { active: true, fast: true });
  assert.equal(fastDisplay().fastLabel, undefined);
  assert.equal(redraws, 4);
  unsubscribe();
});

test("conversion status keeps usage and mode but no longer duplicates fast", () => {
  let status;
  renderCodexStatus({ hasUI: true, model: codexModel, ui: {
    setStatus: (_key, value) => { status = value; }, theme: { fg: (_role, value) => value },
  } }, {
    config: { ui: { statusLine: true }, scope: { allProviders: "off" }, openai: { fast: { astra: true, sol: true, terra: true, luna: true, other: true }, verbosity: "medium" } },
    usageStatus: { fiveHourUsageLeft: 80 },
  }, { kind: "notebook", effectiveOpenAICodex: true });
  assert.match(status, /notebook mode/);
  assert.match(status, /80% left/);
  assert.doesNotMatch(status, /\bfast\b/);
});

test("real adapter synchronization publishes effective fast state across model/config changes", () => {
  const { pi } = harness();
  const dispose = registerConversionFastDisplay(pi);
  let activeTools = ["read", "edit", "write", "bash"];
  pi.getActiveTools = () => activeTools;
  pi.setActiveTools = (names) => { activeTools = names; };
  pi.getAllTools = () => [...ALL_CODEX_ADAPTER_TOOL_NAMES, "read", "edit", "write", "bash"].map((name) => ({ name }));
  const config = structuredClone(DEFAULT_CODEX_CONVERSION_CONFIG);
  config.openai.fast = { astra: false, sol: false, terra: true, luna: true, other: false };
  config.scope.allProviders = "off";
  const state = { config, executionMode: "notebook" };
  const ctx = { model: codexModel, hasUI: false };
  try {
    syncAdapter(pi, ctx, state);
    assert.equal(fastDisplay().fastLabel, "fast");
    config.openai.fast.luna = false;
    syncAdapter(pi, ctx, state);
    assert.equal(fastDisplay().fastLabel, undefined);
    config.openai.fast = { astra: false, sol: false, terra: true, luna: true, other: false };
    syncAdapter(pi, ctx, state);
    assert.equal(fastDisplay().fastLabel, "fast");
    for (const [id, enabled] of [["gpt-6.1-sol", false], ["gpt-6-astra", false], ["gpt-6-terra", true], ["gpt-reserve", true], ["vendor/gpt-7-luna", true], ["gpt-5", false]]) {
      syncAdapter(pi, { ...ctx, model: { ...codexModel, id } }, state);
      assert.equal(fastDisplay().fastLabel, enabled ? "fast" : undefined, id);
    }
    syncAdapter(pi, { ...ctx, model: { provider: "anthropic", api: "anthropic-messages", id: "claude" } }, state);
    assert.equal(fastDisplay().fastLabel, undefined);
  } finally { dispose(); }
});

test("fast ownership follows loaded extension and current route, not installation", () => {
  let commands = [];
  let activeTools = ["read", "edit", "bash"];
  const pi = { getCommands: () => commands, getActiveTools: () => activeTools };
  assert.equal(hasCodexConversion(pi), false);
  assert.equal(conversionOwnsFast(pi, { model: codexModel }), false);
  commands = [{ name: "codex", source: "extension" }];
  assert.equal(conversionOwnsFast(pi, { model: codexModel }), true);
  // Renamed Codex providers retain conversion transport ownership.
  assert.equal(conversionOwnsFast(pi, { model: { ...codexModel, provider: "renamed" } }), true);
  const openai = { provider: "openai", api: "openai-responses" };
  assert.equal(conversionOwnsFast(pi, { model: openai }), false);
  for (const modeTools of [["exec_command", "apply_patch"], ["exec", "wait"], ["exec", "wait", "notebook"]]) {
    activeTools = modeTools;
    assert.equal(conversionOwnsFast(pi, { model: openai }), true);
    assert.equal(conversionOwnsFast(pi, { model: { api: "anthropic-messages" } }), false);
  }
  assert.equal(conversionOwnsFast(pi, {}), false);
  commands = [];
  assert.equal(conversionOwnsFast(pi, { model: codexModel }), false);
});

const patchDetails = (status = "success") => ({ status, result: {
  changedFiles: ["already-dirty.ts"], createdFiles: ["new.ts"], deletedFiles: ["old.ts"], movedFiles: ["renamed.ts"], fuzz: 0,
} });

test("post-edit uses patch outcomes, including partial failure, rather than intended edits", () => {
  const expected = ["already-dirty.ts", "new.ts", "old.ts", "renamed.ts"];
  assert.deepEqual(touchedFiles("apply_patch", {}, patchDetails(), false), expected);
  assert.deepEqual(touchedFiles("apply_patch", {}, patchDetails("partial_failure"), true), expected);
  assert.deepEqual(touchedFiles("apply_patch", { input: "a patch" }, undefined, true), []);
  assert.deepEqual(touchedFiles("exec_command", {}, patchDetails(), false), []);
  assert.deepEqual(touchedFiles("edit", { path: "a.ts" }, undefined, false), ["a.ts"]);
  assert.deepEqual(touchedFiles("write", { path: "a.ts" }, undefined, true), []);
});

test("post-edit runs for direct and nested patches to already-dirty files, in either broker load order", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-conversion-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, ".pi"));
  await writeFile(join(cwd, ".pi/post-edit.json"), JSON.stringify({ jobs: [{ name: "check", command: "fixture-check", args: ["{files}"] }] }));
  for (const brokerFirst of [true, false]) {
    const { pi, fire } = harness();
    let completion;
    const jobs = [];
    const broker = {
      protocol: protocol.PREFLIGHT_PROTOCOL,
      isActive: () => true,
      register: () => () => {},
      registerCompletion(callback) { completion = callback; return () => { completion = undefined; }; },
    };
    const installBroker = () => {
      pi.events.on(protocol.PREFLIGHT_REQUEST_CHANNEL, () => pi.events.emit(protocol.PREFLIGHT_AVAILABLE_CHANNEL, broker));
      pi.events.emit(protocol.PREFLIGHT_AVAILABLE_CHANNEL, broker);
    };
    pi.exec = async (command, args) => {
      if (command === "git") return { code: 0, stdout: " M already-dirty.ts\0", stderr: "" };
      jobs.push({ command, args });
      return { code: 0, stdout: "", stderr: "" };
    };
    pi.sendUserMessage = () => assert.fail("successful validation must not request another turn");
    const ctx = { cwd, hasUI: false, ui: { notify() {} } };
    if (brokerFirst) installBroker();
    postEdit(pi);
    if (!brokerFirst) installBroker();
    for (const nested of [false, true]) {
      await fire("agent_start", {}, ctx);
      const details = { status: "partial_failure", result: { changedFiles: ["already-dirty.ts"] } };
      if (nested) await completion({ toolName: "apply_patch", input: {}, status: "error", phase: "execution", result: { details }, cwd, signal: new AbortController().signal });
      else await fire("tool_result", { toolName: "apply_patch", input: {}, details, isError: true }, ctx);
      await fire("agent_end", {}, ctx);
    }
    assert.equal(jobs.length, 2);
    assert.ok(jobs.every(({ args }) => args.includes("already-dirty.ts")));
    await fire("session_shutdown");
    assert.equal(completion, undefined);
  }
});

test("/fast dispatches only to a loaded integration owning the current route", async () => {
  const { default: fast } = await jiti.import("../extensions/fast/index.ts");
  const commands = new Map();
  const sent = [];
  const notices = [];
  let loaded = true;
  let activeTools = ["exec", "wait", "notebook"];
  const pi = {
    registerCommand: (name, command) => commands.set(name, command),
    getCommands: () => loaded ? [{ name: "codex", source: "extension" }] : [],
    getActiveTools: () => activeTools,
    sendUserMessage: (...args) => sent.push(args),
  };
  fast(pi);
  const ctx = { model: codexModel, ui: { notify: (...args) => notices.push(args) } };
  const run = (args = "") => commands.get("fast").handler(args, ctx);
  await run();
  ctx.model = { ...codexModel, provider: "renamed" };
  await run();
  ctx.model = { api: "openai-responses", provider: "openai" };
  await run();
  assert.equal(sent.length, 3);
  assert.deepEqual(sent[0], ["/codex fast", { expandPromptTemplates: true }]);
  activeTools = ["read", "bash"];
  await run();
  ctx.model = { api: "anthropic-messages", provider: "anthropic" };
  await run();
  ctx.model = codexModel;
  loaded = false;
  await run();
  ctx.model = undefined;
  await run();
  await run("on");
  assert.equal(sent.length, 3);
  assert.equal(notices.length, 5);
  assert.equal(notices.at(-1)[1], "error");
});

test("real Code/Notebook runtime imports callable tools without bypassing explicit gates or eligibility", async (t) => {
  const { registerCodexCodeMode } = await import("@howaboua/pi-codex-conversion/dist/adapter/code-mode.js");
  const { adaptToolForCodeMode, registerCodeModeExtensionTools } = await import("@howaboua/pi-codex-conversion/code-mode");
  const { pi, fire, tools } = harness();
  const explicit = {
    name: "explicit_fixture", label: "Fixture", description: "Explicit import fixture", parameters: Type.Object({}),
    execute: async () => ({ content: [{ type: "text", text: "fixture" }] }),
  };
  pi.registerTool(explicit);
  const registration = registerCodeModeExtensionTools(pi, () => [adaptToolForCodeMode(explicit, {
    usage: "await tools.explicit_fixture(input)",
  })], {
    isActive: ctx => ctx?.model?.api !== "openai-codex-responses",
  });
  t.after(() => registration.unregister());
  pi.registerTool({ name: "ordinary_extension", description: "Automatic import fixture", parameters: Type.Object({}) });
  const nativeTools = ["read", "edit", "write", "bash", ...ALL_CODEX_ADAPTER_TOOL_NAMES];
  pi.getAllTools = () => [...new Set([...nativeTools, ...tools.map(tool => tool.name)])].map(name => ({ name }));
  let active = [...nativeTools, ...tools.map(tool => tool.name)];
  pi.getActiveTools = () => active;
  pi.setActiveTools = names => { active = names; };
  const config = structuredClone(DEFAULT_CODEX_CONVERSION_CONFIG);
  config.scope.allProviders = "on";
  config.tools.autoReasoning = false;
  const state = { config };
  const runtime = await registerCodexCodeMode(pi, { state, tracker: {}, sessions: new Map() });
  t.after(async () => { await fire("session_shutdown"); await runtime.shutdown(); });
  const exec = tools.find(tool => tool.name === "exec");
  const callable = tools.filter(tool => ["ordinary_extension", "explicit_fixture"].includes(tool.name));
  const nameOf = tool => tool.topLevelName ?? tool.name;
  for (const mode of ["code", "notebook"]) {
    state.executionMode = mode;
    for (const model of [
      { provider: "anthropic", api: "anthropic-messages", id: "claude" },
      codexModel,
      { ...codexModel, provider: "renamed" },
      { provider: "anthropic", api: "anthropic-messages", id: "claude" },
    ]) {
      const ctx = { cwd: "/fixture", model, hasUI: false, isProjectTrusted: () => false };
      await fire("model_select", {}, ctx);
      syncAdapter(pi, ctx, state);
      // Resolve active providers, then exercise the exec tool's actual loadout hook.
      runtime.getTools(ctx);
      const changes = exec.prepareLoadout({ callable, declared: active.map(name => ({ name })), getNamespace: () => undefined });
      assert.ok(changes.hiddenDeclarations.includes("ordinary_extension"));
      const nested = runtime.getTools(ctx);
      assert.equal(nested.filter(tool => nameOf(tool) === "ordinary_extension").length, 1);
      assert.equal(nested.filter(tool => nameOf(tool) === "explicit_fixture").length, model.api === "openai-codex-responses" ? 0 : 1);
      const saved = state.previousToolNames;
      state.previousToolNames = saved.filter(name => name !== "explicit_fixture");
      assert.ok(!runtime.getTools(ctx).some(tool => nameOf(tool) === "explicit_fixture"), "an ineligible explicit tool cannot fall back to automatic import");
      state.previousToolNames = saved;
      exec.prepareLoadout({ callable: [], declared: active.map(name => ({ name })), getNamespace: () => undefined });
      assert.ok(!runtime.getTools(ctx).some(tool => nameOf(tool) === "ordinary_extension"), "callable removals reach the actual runtime");
    }
  }
});

test("inactive conversion preserves later external tool selections", () => {
  const { pi } = harness();
  let active = ["read", "edit", "write", "bash", "external"];
  pi.getActiveTools = () => active;
  pi.setActiveTools = names => { active = names; };
  pi.getAllTools = () => [...ALL_CODEX_ADAPTER_TOOL_NAMES, "read", "edit", "write", "bash", "external"].map(name => ({ name }));
  const config = structuredClone(DEFAULT_CODEX_CONVERSION_CONFIG);
  config.scope.allProviders = "off";
  const state = { config, executionMode: "notebook" };
  syncAdapter(pi, { model: codexModel, hasUI: false }, state);
  const inactive = { model: { provider: "anthropic", api: "anthropic-messages", id: "claude" }, hasUI: false };
  syncAdapter(pi, inactive, state);
  active = ["read", "external"]; // Another extension changes its selection after deactivation.
  syncAdapter(pi, inactive, state);
  assert.deepEqual(active, ["read", "external"]);
});
