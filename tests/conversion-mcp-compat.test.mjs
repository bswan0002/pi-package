import assert from "node:assert/strict";
import test from "node:test";
import { createPiCodeModeBridge } from "@howaboua/pi-codex-conversion/dist/adapter/code-mode/pi-tools.js";

test("bundled conversion preserves MCP namespace guidance and missing-tool recovery", async () => {
  const name = "mcp__example__lookup";
  const namespace = { name: "mcp__example", description: "Read the project guide before querying." };
  const bridge = createPiCodeModeBridge({ getAllTools: () => [{ name, sourceInfo: { path: "builtin:mcp" } }] });
  const loadout = { callable: [{ name, description: "Look up a record", parameters: { type: "object" } }],
    getNamespace: () => namespace, getExposure: () => "deferred" };
  assert.deepEqual(bridge.prepareLoadout(loadout), { hiddenDeclarations: [name] });
  const [tool] = bridge.getTools();
  assert.deepEqual(tool.namespace, namespace);
  assert.equal(tool.deferLoading, true);
  assert.equal(tool.discovery, "server");
  assert.equal(tool.discoverWhenDeferred, true);
  let captured;
  await assert.rejects(tool.invoke({}, {
    executeTool: async () => ({ isError: true, result: { content: [{ type: "text", text: `Tool ${name} not found` }] } }),
    captureResult: (result) => { captured = result; },
  }), /MCP namespace "mcp__example".*retry in a new exec cell/);
  assert.match(captured.content[0].text, /suggest disabling that specific server/);
  const payload = { isError: true, content: [{ type: "text", text: "Server-specific error" }] };
  assert.equal(await tool.invoke({}, {
    executeTool: async () => ({ isError: true, result: { content: payload.content, structuredContent: payload } }),
  }), payload, "server errors retain their structured result contract");
  assert.deepEqual(bridge.prepareLoadout({ ...loadout, getExposure: () => "direct" }),
    { hiddenDeclarations: [name] }, "bridged MCP calls stay in Code/Notebook even when Pi exposure is direct");
});

test("automatic extension imports preserve Pi admission, execution, and result contracts", async () => {
  const parameters = { type: "object", properties: { value: { type: "string" } } };
  const definitions = [
    { name: "ordinary", description: "Ordinary extension", parameters },
    { name: "structured", description: "Structured extension", parameters, outputSchema: { type: "object" } },
    { name: "not_callable", parameters },
    { name: "codemode", parameters },
    { name: "exec", parameters },
    { name: "tool_search", parameters, sourceInfo: { path: "builtin:tool-search" } },
  ];
  const bridge = createPiCodeModeBridge({ getAllTools: () => definitions });
  const changes = bridge.prepareLoadout({
    callable: definitions.filter(t => t.name !== "not_callable"),
    getNamespace: () => undefined,
  });
  assert.deepEqual(changes.hiddenDeclarations, ["ordinary", "structured"]);
  const [ordinary, structured] = bridge.getTools();
  assert.equal(ordinary.executionPipeline, "pi");
  assert.deepEqual(ordinary.inputSchema, parameters);
  assert.deepEqual(bridge.getTools(["ordinary"]).map(t => t.name), ["structured"]);
  const signal = new AbortController().signal;
  const onUpdate = () => {};
  let captured;
  const result = { content: [{ type: "text", text: "done" }], details: { untouched: true } };
  const context = {
    onUpdate,
    executeTool: async (name, input, options) => {
      assert.equal(name, "ordinary");
      assert.deepEqual(input, { value: "hello" });
      assert.equal(options.signal, signal);
      assert.equal(options.onUpdate, onUpdate);
      return { isError: false, result };
    },
    captureResult: value => { captured = value; },
  };
  assert.equal(await ordinary.invoke({ value: "hello" }, context, signal), "done");
  assert.equal(captured, result);
  await assert.rejects(() => ordinary.invoke({}, {}, signal), /Pi nested tool executor is unavailable/);
  await assert.rejects(() => ordinary.invoke({}, {
    executeTool: async () => ({ isError: true, result: { content: [{ type: "text", text: "Permission denied" }] } }),
  }, signal), /Permission denied/);
  const payload = { error: "structured error" };
  assert.equal(await structured.invoke({}, {
    executeTool: async () => ({ isError: true, result: { content: [], structuredContent: payload } }),
  }, signal), payload);
  const content = [{ type: "image", data: "fixture", mimeType: "image/png" }];
  assert.deepEqual(await ordinary.invoke({}, {
    executeTool: async () => ({ isError: false, result: { content } }),
  }, signal), { content });
  bridge.prepareLoadout({ callable: [], getNamespace: () => undefined });
  assert.deepEqual(bridge.getTools(), [], "removed callable tools cannot survive a loadout refresh");
});
