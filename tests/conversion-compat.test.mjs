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
const { hasCodexConversion, conversionOwnsFast, visibleExtensionStatuses, registerCompatibleTool } = await jiti.import("../extensions/shared/codex-conversion.ts");
const { STATUS_KEY, RESET_STATUS_KEY } = await jiti.import("../extensions/better-openai/src/identity.ts");
const { touchedFiles } = await jiti.import("../extensions/post-edit/touched-files.ts");
const { default: postEdit } = await jiti.import("../extensions/post-edit/index.ts");
const { getCodeModeExtensionToolSnapshot } = await import("@howaboua/pi-codex-conversion/dist/code-mode-extension-tools.js");
const { registerConversionFastDisplay, setBetterOpenAIState, getBetterOpenAIState: fastDisplay, onBetterOpenAIStateChange } = await jiti.import("../extensions/shared/better-openai-state.ts");
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

test("conversion fast state appears in the custom footer without competing with standalone state", async () => {
  const { pi, fire } = harness();
  let redraws = 0;
  const unsubscribe = onBetterOpenAIStateChange(() => redraws++);
  const dispose = registerConversionFastDisplay(pi);
  setBetterOpenAIState({ fastLabel: "fast" });
  pi.events.emit("pi-package:codex-fast-state", { active: true, fast: false });
  assert.equal(fastDisplay().fastLabel, undefined);
  pi.events.emit("pi-package:codex-fast-state", { active: true, fast: true });
  assert.equal(fastDisplay().fastLabel, "fast");
  setBetterOpenAIState({ fastLabel: undefined });
  assert.equal(fastDisplay().fastLabel, "fast", "Better OpenAI refresh cannot erase conversion's enabled state");
  pi.events.emit("pi-package:codex-fast-state", { active: true, fast: false });
  assert.equal(fastDisplay().fastLabel, undefined);
  setBetterOpenAIState({ fastLabel: "fast" });
  pi.events.emit("pi-package:codex-fast-state", { active: false, fast: true });
  assert.equal(fastDisplay().fastLabel, "fast", "leaving conversion restores standalone display");
  assert.ok(redraws >= 4);
  await fire("session_shutdown");
  dispose();
  unsubscribe();
  setBetterOpenAIState({ fastLabel: undefined });
  pi.events.emit("pi-package:codex-fast-state", { active: true, fast: true });
  assert.equal(fastDisplay().fastLabel, undefined);
});

test("conversion status keeps usage and mode but no longer duplicates fast", () => {
  let status;
  renderCodexStatus({ hasUI: true, model: codexModel, ui: {
    setStatus: (_key, value) => { status = value; }, theme: { fg: (_role, value) => value },
  } }, {
    config: { ui: { statusLine: true }, scope: { allProviders: "off" }, openai: { fast: true, verbosity: "medium" } },
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
  config.openai.fast = true;
  config.scope.allProviders = "off";
  const state = { config, executionMode: "notebook" };
  const ctx = { model: codexModel, hasUI: false };
  try {
    syncAdapter(pi, ctx, state);
    assert.equal(fastDisplay().fastLabel, "fast");
    config.openai.fast = false;
    syncAdapter(pi, ctx, state);
    assert.equal(fastDisplay().fastLabel, undefined);
    config.openai.fast = true;
    syncAdapter(pi, ctx, state);
    assert.equal(fastDisplay().fastLabel, "fast");
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

test("quota deduplication tracks actual status presence and preserves unrelated statuses", () => {
  const statuses = new Map([[STATUS_KEY, "5h: 80%"], ["other", "working"]]);
  assert.deepEqual(visibleExtensionStatuses(statuses), [...statuses]);
  statuses.set("codex-adapter", "Codex adapter quota");
  assert.deepEqual(visibleExtensionStatuses(statuses).map(([key]) => key), ["other", "codex-adapter"]);
  assert.equal(statuses.has(STATUS_KEY), true, "filter must not erase fallback status");
  statuses.set("codex-adapter", "");
  assert.ok(visibleExtensionStatuses(statuses).some(([key]) => key === STATUS_KEY));
  statuses.delete("codex-adapter");
  assert.deepEqual(visibleExtensionStatuses(statuses), [...statuses]);
});

test("reset countdowns survive conversion status without duplicating standalone usage", () => {
  const statuses = new Map([[STATUS_KEY, "7d: 84% ↺ 1d18h"], [RESET_STATUS_KEY, "7d ↺ 1d18h"]]);
  assert.deepEqual(visibleExtensionStatuses(statuses), [[STATUS_KEY, "7d: 84% ↺ 1d18h"]]);
  statuses.set("codex-adapter", "Codex adapter • weekly: 84% left");
  assert.deepEqual(visibleExtensionStatuses(statuses), [["codex-adapter", "Codex adapter • weekly: 84% left · 1d18h ↺"]]);
  assert.equal(statuses.get("codex-adapter"), "Codex adapter • weekly: 84% left", "rendering must not mutate conversion's status");
  statuses.set("codex-adapter", "");
  assert.ok(visibleExtensionStatuses(statuses).some(([key]) => key === STATUS_KEY));
  assert.ok(!visibleExtensionStatuses(statuses).some(([key]) => key === RESET_STATUS_KEY));
});

test("inline quota resets preserve ANSI, omit unavailable windows, and follow settings changes", () => {
  const adapter = "\x1b[2mCodex adapter • 5h: 80% left • weekly: 32% left\x1b[22m";
  const statuses = new Map([["codex-adapter", adapter], [RESET_STATUS_KEY, "5h ↺ 1h0m | 7d ↺ 1d18h"]]);
  assert.deepEqual(visibleExtensionStatuses(statuses), [["codex-adapter", "\x1b[2mCodex adapter • 5h: 80% left · 1h0m ↺ • weekly: 32% left · 1d18h ↺\x1b[22m"]]);
  statuses.set(RESET_STATUS_KEY, "7d ↺ 1d18h");
  assert.equal(visibleExtensionStatuses(statuses)[0][1], "\x1b[2mCodex adapter • 5h: 80% left • weekly: 32% left · 1d18h ↺\x1b[22m");
  statuses.set(RESET_STATUS_KEY, "Secondary ↺ 1d18h | 2h ↺ 1h0m");
  assert.deepEqual(visibleExtensionStatuses(statuses), [["codex-adapter", adapter]], "unknown durations must not be attached to a guessed quota");
  statuses.delete(RESET_STATUS_KEY);
  assert.deepEqual(visibleExtensionStatuses(statuses), [["codex-adapter", adapter]]);
});

test("custom tools remain normal Pi tools and compose with conversion through the public API", async () => {
  const { pi, fire, tools } = harness();
  let capturedContext;
  registerCompatibleTool(pi, {
    name: "ask_user_question", label: "Ask", description: "Ask a question",
    parameters: Type.Object({ question: Type.String() }),
    execute: async (_id, args, _signal, _update, ctx) => {
      capturedContext = ctx;
      return { content: [{ type: "text", text: args.question }], details: undefined };
    },
  });
  assert.equal(tools.length, 1);
  const [nested] = getCodeModeExtensionToolSnapshot(pi, undefined).tools;
  assert.equal(nested.topLevelName, "ask_user_question");
  assert.equal(nested.blocking, true);
  assert.deepEqual(nested.inputSchema, tools[0].parameters);
  const signal = new AbortController().signal;
  const ctx = { cwd: "/fixture", hasUI: true };
  const result = await nested.invoke({ question: "Which?" }, { extensionContext: ctx, toolCallId: "nested-1" }, signal);
  assert.ok(JSON.stringify(result).includes("Which?"));
  assert.equal(capturedContext.cwd, ctx.cwd);
  await assert.rejects(() => nested.invoke({}, { extensionContext: ctx }, signal), /Invalid/);
  await fire("session_shutdown");
  assert.equal(getCodeModeExtensionToolSnapshot(pi, undefined).tools.length, 0);
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

test("Better OpenAI delegates fast controls and preserves standalone preferences across model/scope switches", async (t) => {
  const { default: betterOpenAI } = await jiti.import("../extensions/better-openai/index.ts");
  const { getBetterOpenAIState } = await jiti.import("../extensions/shared/better-openai-state.ts");
  const cwd = await mkdtemp(join(tmpdir(), "pi-fast-compat-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, ".pi/extensions"), { recursive: true });
  await writeFile(join(cwd, ".pi/extensions/pi-better-openai.json"), JSON.stringify({
    persistState: true, desiredActive: true, supportedModels: ["openai-codex/gpt-6-luna", "openai/gpt-6-luna"],
    usage: { enabled: false }, footer: { mode: "status" },
  }));
  const { pi, fire } = harness();
  const commands = new Map();
  const sent = [];
  let activeTools = ["exec_command", "apply_patch"];
  pi.getCommands = () => [{ name: "codex", source: "extension" }];
  pi.getActiveTools = () => activeTools;
  pi.registerProvider = () => assert.fail("conversion must retain provider ownership");
  pi.registerCommand = (name, command) => commands.set(name, command);
  pi.registerFlag = () => {};
  pi.registerMessageRenderer = () => {};
  pi.getFlag = () => false;
  pi.sendUserMessage = (...args) => sent.push(args);
  const ctx = {
    cwd, hasUI: false, model: codexModel,
    sessionManager: { getSessionId: () => "fixture", getEntries: () => [] },
    ui: { notify() {}, setStatus() {} }, modelRegistry: { isUsingOAuth: () => true },
  };
  betterOpenAI(pi);
  await fire("session_start", {}, ctx);
  t.after(() => fire("session_shutdown"));
  const request = { payload: { service_tier: "auto" } };
  assert.equal(await fire("before_provider_request", request, ctx), undefined);
  assert.equal(getBetterOpenAIState().fastLabel, undefined);
  await commands.get("fast").handler("", ctx);
  assert.deepEqual(sent, [["/codex fast", { expandPromptTemplates: true }]]);
  assert.equal(request.payload.service_tier, "auto");

  // Switch away from the adapter. The saved standalone preference resumes.
  ctx.model = { ...codexModel, provider: "openai", api: "openai-responses" };
  activeTools = ["read", "edit", "bash"];
  await fire("model_select", { model: ctx.model, previousModel: codexModel }, ctx);
  assert.equal((await fire("before_provider_request", request, ctx)).service_tier, "priority");
  assert.equal(getBetterOpenAIState().fastLabel, "fast");

  // Changing conversion scope without model_select must also stop injection.
  activeTools = ["exec", "wait", "notebook"];
  assert.equal(await fire("before_provider_request", request, ctx), undefined);
  await fire("turn_end", {}, ctx);
  assert.equal(getBetterOpenAIState().fastLabel, undefined);
  activeTools = ["read", "edit", "bash"];
  assert.equal((await fire("before_provider_request", request, ctx)).service_tier, "priority");
  await commands.get("fast").handler("", ctx);
  assert.equal(await fire("before_provider_request", request, ctx), undefined);
});

test("all package custom tools are offered to Code/Notebook without replacing their Pi registrations", async () => {
  const { registerAskUserQuestionTool } = await jiti.import("../extensions/ask-user-question/ask-user-question.ts");
  const { default: braveSearch } = await jiti.import("../extensions/brave-search/index.ts");
  const { pi, fire, tools } = harness();
  pi.registerCommand = () => {};
  pi.registerMessageRenderer = () => {};
  registerAskUserQuestionTool(pi);
  braveSearch(pi);
  const nested = getCodeModeExtensionToolSnapshot(pi, { model: { provider: "anthropic", api: "anthropic-messages" } }, { refreshGates: true }).tools;
  const expected = ["ask_user_question", "brave_search"];
  assert.deepEqual(tools.map((tool) => tool.name).sort(), expected);
  assert.deepEqual(nested.map((tool) => tool.topLevelName).sort(), expected);
  assert.equal(nested.find((tool) => tool.topLevelName === "ask_user_question").blocking, true);
  await fire("session_shutdown");
  assert.equal(getCodeModeExtensionToolSnapshot(pi, undefined).tools.length, 0);
});
