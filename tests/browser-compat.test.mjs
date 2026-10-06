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
  ]) await assert.rejects(() => tool.execute("bad", tool.prepareArguments(input), undefined, undefined, ctx));
});
