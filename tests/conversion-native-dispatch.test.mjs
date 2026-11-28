import assert from "node:assert/strict";
import test from "node:test";
import { runToolCall } from "@earendil-works/pi-agent-core";
import { toNestedTool } from "@howaboua/pi-codex-conversion/dist/adapter/code-mode/nested-tool-adapter.js";
import { PiToolCallScope } from "@howaboua/pi-codex-conversion/dist/tools/code-mode/pi-tool-call-scope.js";

test("owned nested tools use Pi's selection, validation and guard pipeline without a direct-execution fallback", async () => {
  let calls = 0;
  const native = { name: "fixture", label: "Fixture", description: "Fixture", parameters: {
    type: "object", properties: { value: { type: "string" } }, required: ["value"],
  }, execute: async (_id, args) => { calls++; return { content: [{ type: "text", text: args.value }], details: {} }; } };
  const nested = toNestedTool({ ...native, execute: () => assert.fail("must dispatch through Pi") }, "fixture", { pccHooks: true });
  let admitted = [native];
  let blocked = false;
  const signal = new AbortController().signal;
  const ctx = { executeTool: (name, args, options) => runToolCall({ type: "toolCall", id: "outer/1", name, arguments: args }, {
    tools: admitted, context: { messages: [], tools: admitted }, assistantMessage: { role: "assistant", content: [] },
    beforeToolCall: () => blocked ? { block: true, reason: "fixture guard denied" } : undefined,
    ...options,
  }) };
  const scope = new PiToolCallScope(ctx, signal);
  const invoke = input => nested.invoke(input, { piToolScope: scope }, signal);
  assert.equal(await invoke({ value: "allowed" }), "allowed");
  assert.equal(calls, 1);
  blocked = true;
  await assert.rejects(invoke({ value: "denied" }), /fixture guard denied/);
  admitted = [];
  await assert.rejects(invoke({ value: "removed" }), /not found/);
  admitted = [native]; blocked = false;
  await assert.rejects(invoke({}), /value/);
  assert.equal(calls, 1);
  await assert.rejects(nested.invoke({ value: "fallback" }, {}, signal), /Pi nested tool execution is unavailable/);
  await scope.close();
  await assert.rejects(invoke({ value: "after close" }), /Pi nested tool execution is unavailable/);
  assert.equal(calls, 1);
});

test("outer yield waits for in-flight Pi calls and closed scopes reject further dispatch", async () => {
  let finish;
  const result = { result: { content: [] }, isError: false };
  const scope = new PiToolCallScope({ executeTool: () => new Promise(resolve => { finish = () => resolve(result); }) });
  const pending = scope.run("fixture", {});
  let closed = false;
  const close = scope.close().then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false);
  assert.equal(scope.run("fixture", {}), undefined);
  finish();
  assert.equal(await pending, result);
  await close;
  assert.equal(closed, true);
});
