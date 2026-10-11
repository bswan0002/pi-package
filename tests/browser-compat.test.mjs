import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserTool, prepareBrowserInput } from "../node_modules/@howaboua/pi-browser/dist/src/browser-tool.js";
import { adaptToolForCodeMode } from "@howaboua/pi-codex-conversion/code-mode";

// Exercise both shipped adapters without starting CDP or contacting a browser.
test("browser native and nested calls tolerate unused response_length while preserving page controls", async () => {
  const requests = [];
  const tool = createBrowserTool({ execute: async request => { requests.push(request); return { ok: true }; } });
  const ctx = { sessionManager: { getSessionId: () => "fixture" } };
  const nested = adaptToolForCodeMode(tool, { kind: "freeform", prepareInput: prepareBrowserInput, usage: "await tools.browser(input)" });
  const inputs = [
    { action: "tabs", response_length: "short" },
    { action: "open", url: "https://example.com", response_length: "long" },
    { action: "click", ref_id: "tab1", id: 2, response_length: "short" },
    { tabs: [{ response_length: "long" }], response_length: "short" },
    { open: [{ ref_id: "tab1" }], find: [{ ref_id: "tab1", pattern: "hello" }], response_length: "long" },
  ];
  for (const input of inputs) {
    await tool.execute("fixture", tool.prepareArguments(input), undefined, undefined, ctx);
    const native = requests.at(-1);
    await nested.invoke(JSON.stringify(input), { extensionContext: ctx }, new AbortController().signal);
    assert.deepEqual(requests.at(-1), native);
    for (const op of native.operations) {
      if (op.action === "find" || (op.action === "open" && op.ref_id)) assert.equal(op.response_length, "long");
      else assert.equal(Object.hasOwn(op, "response_length"), false);
    }
  }
  const beforeBlocked = requests.length;
  await assert.rejects(() => nested.invoke('{"action":"tabs"}', {
    extensionContext: ctx, toolCallId: "blocked",
    preflight: async call => {
      assert.deepEqual(call.input, { command: '{"action":"tabs"}' });
      throw new Error("Permission denied");
    },
  }, new AbortController().signal), /Permission denied/);
  assert.equal(requests.length, beforeBlocked, "nested admission denial cannot execute browser operations");
  for (const input of [
    { action: "open", ref_id: "tab1", response_length: "invalid" },
    { action: "tabs", unexpected: true },
    { find: [{ ref_id: "tab1", pattern: "hello", response_length: "short" }] },
  ]) await assert.rejects(async () => tool.execute("bad", tool.prepareArguments(input), undefined, undefined, ctx));
});

test("browser empty native and nested calls request help without operations", async () => {
  const requests = [];
  const tool = createBrowserTool({ execute: async request => { requests.push(request); return { help: true }; } });
  const ctx = { sessionManager: { getSessionId: () => "fixture" } };
  const nested = adaptToolForCodeMode(tool, { kind: "freeform", prepareInput: prepareBrowserInput, usage: "await tools.browser(input)" });
  for (const input of [undefined, {}, { command: "help" }]) {
    await tool.execute("help", tool.prepareArguments(input), undefined, undefined, ctx);
    assert.deepEqual(requests.at(-1), { help: true });
  }
  for (const input of [undefined, "{}", "help"]) {
    await nested.invoke(input, { extensionContext: ctx }, new AbortController().signal);
    assert.deepEqual(requests.at(-1), { help: true });
  }
});

test("foreground capture disables background rendering before activating the target", async () => {
  const { BrowserCdpSession } = await import("../node_modules/@howaboua/pi-browser/dist/src/cdp/session.js");
  const session = new BrowserCdpSession();
  const steps = [];
  const signal = new AbortController().signal;
  session.pages = async () => [{ targetId: "target1", owned: true }];
  session.tabs.set("target1", {
    setBackgroundRendering: async enabled => steps.push(["background", enabled]),
    run: async (_ref, current, action) => {
      assert.equal(current, signal);
      return action({ cdp: { send: async (method, params) => steps.push([method, params]) } });
    },
  });
  await session.withTab("target1", signal, async () => steps.push(["capture"]), "foreground");
  assert.deepEqual(steps, [["background", false], ["Target.activateTarget", { targetId: "target1" }], ["capture"]]);
  steps.length = 0;
  await session.withTab("target1", signal, async () => steps.push(["read"]));
  assert.deepEqual(steps, [["background", true], ["read"]]);
});
