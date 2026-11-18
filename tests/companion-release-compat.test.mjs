import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
const require = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { createWebSearchTool } = await jiti.import("../node_modules/@howaboua/pi-codex-web-run/src/tool.ts");
const { createImageGenerationTool } = await jiti.import("../node_modules/@howaboua/pi-codex-imagegen/src/tool.ts");

test("Web Run native schema retains open fields, enums and Pi numeric validation", () => {
  const tool = createWebSearchTool();
  const validate = arguments_ => validateToolArguments(tool,
    { type: "toolCall", id: "fixture", name: tool.name, arguments: arguments_ });
  const input = { search_query: [{ q: "fixture", recency: "7", domains: ["example.com"], future: true }],
    open: [{ ref_id: "https://example.com", lineno: "2" }], click: [{ ref_id: "ref", id: "3" }],
    image_query: [{ q: "fixture" }], find: [{ ref_id: "ref", pattern: "fixture" }],
    response_length: "short", settings: { search_context_size: "high", future: true }, future: { kept: true } };
  const expected = structuredClone(input);
  expected.search_query[0].recency = 7;
  expected.open[0].lineno = 2;
  expected.click[0].id = 3;
  assert.deepEqual(validate(input), expected);
  assert.equal(input.search_query[0].recency, "7");
  for (const args of [{ response_length: "invalid" }, { settings: { search_context_size: "invalid" } },
    { search_query: [{}] }, { click: [{ ref_id: "ref", id: Infinity }] }])
    assert.throws(() => validate(args));
  assert.deepEqual(validate({}), {});
});

test("imagegen result renderer leaves images in canonical content for Pi to display once", () => {
  const tool = createImageGenerationTool();
  const result = { content: [{ type: "text", text: "Generated fixture" },
    { type: "image", mimeType: "image/png", data: "fixture-image" }] };
  const before = structuredClone(result);
  const component = tool.renderResult(result, {}, { fg: (_role, text) => text });
  assert.ok(component instanceof Text, "custom result renderer must not add a second image component");
  assert.match(component.render(80).join("\n"), /Generated fixture/);
  assert.deepEqual(result, before, "canonical image remains available to Pi and history");
  assert.equal(createImageGenerationTool({ customRendering: false }).renderResult, undefined);
});
