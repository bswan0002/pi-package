import assert from "node:assert/strict";
import test from "node:test";
import { createMcpCodeModeBridge } from "@howaboua/pi-codex-conversion/dist/adapter/code-mode/mcp-tools.js";

test("bundled conversion preserves MCP namespace guidance and missing-tool recovery", async () => {
  const name = "mcp__example__lookup";
  const namespace = { name: "mcp__example", description: "Read the project guide before querying." };
  const bridge = createMcpCodeModeBridge({ getAllTools: () => [{ name, sourceInfo: { path: "builtin:mcp" } }] });
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
    { hiddenDeclarations: [] }, "explicitly direct MCP tools retain their declarations");
});
