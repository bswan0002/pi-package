import assert from "node:assert/strict";
import test from "node:test";
import { buildRequestBody } from "@howaboua/pi-codex-conversion/dist/providers/openai-codex/request-body.js";

const tool = (name, description = name) => ({ name, description, parameters: { type: "object", properties: {} } });
const system = fields => ({ role: "system", content: "", timestamp: 0, ...fields });
const user = { role: "user", content: "Continue", timestamp: 1 };

for (const change of ["removal", "redefinition"]) {
  for (const mode of ["additional", "search", "none"]) {
    test(`conversion preserves deferred tool declarations after ${change} (${mode})`, () => {
      const model = { api: "openai-codex-responses", provider: "openai-codex", id: "gpt-6-luna", reasoning: true, input: ["text"],
        compat: { supportsMidConvoSystemMessages: true, supportsAdditionalTools: mode === "additional", supportsToolSearch: mode === "search" } };
      const messages = [system({ content: "Fixture", toolsAdded: [tool("keep"), tool("changed")] }), user,
        system(change === "removal" ? { toolsRemoved: [{ name: "changed" }] } : { toolsAdded: [tool("changed", "new contract")] }), user];
      const before = buildRequestBody(model, { messages });
      messages.push(system({ toolsAdded: [tool("late")] }), user);
      const after = buildRequestBody(model, { messages });
      const names = values => (values ?? []).map(t => t.name);
      const expected = change === "removal" ? ["keep"] : ["keep", "changed"];
      assert.deepEqual(names(before.tools), expected);
      assert.deepEqual(names(after.tools), mode === "none" ? [...expected, "late"] : expected);
      if (change === "redefinition") assert.equal(after.tools.find(t => t.name === "changed").description, "new contract");
      const declarations = after.input.filter(item => item.type === "additional_tools" || item.type === "tool_search_output");
      assert.equal(declarations.length, mode === "none" ? 0 : 1);
      if (mode !== "none") {
        assert.deepEqual(names(declarations[0].tools), ["late"]);
        assert.deepEqual(after.tools, before.tools, "later loads must preserve the top-level cache prefix");
        assert.deepEqual(after.input.slice(0, before.input.length), before.input, "prior transcript remains unchanged");
      }
    });
  }
}
