import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { Type } from "typebox";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { createAutoReasoning } from "@howaboua/pi-codex-conversion/dist/adapter/auto-reasoning.js";
import { registerGippityVoiceTool, collectGippityVoiceTools } from "@howaboua/pi-codex-conversion/dist/voice/realtime-tools.js";

const validate = (parameters, args) => validateToolArguments(
  { name: "fixture", description: "Fixture", parameters },
  { type: "toolCall", id: "fixture", name: "fixture", arguments: args },
);

test("Pi validates TypeBox and plain JSON tools with the same coercion", () => {
  const typed = Type.Object({ count: Type.Integer(), labels: Type.Array(Type.String()) });
  const plain = JSON.parse(JSON.stringify(typed));
  const input = { count: "3.5", labels: "one" };
  for (const schema of [typed, plain]) {
    assert.deepEqual(validate(schema, input), { count: 3, labels: ["one"] });
    assert.throws(() => validate(schema, { count: "invalid", labels: [] }), /count/);
    assert.throws(() => validate(schema, { labels: [] }), /count/);
  }
  assert.deepEqual(input, { count: "3.5", labels: "one" }, "validation preserves the caller's input");
});

test("conversion auto-reasoning schema accepts its levels after Pi removes Type exports", () => {
  const { tool } = createAutoReasoning({}, {});
  for (const level of ["low", "medium", "high", "xhigh", "max"])
    assert.deepEqual(validate(tool.parameters, { level }), { level });
  assert.throws(() => validate(tool.parameters, { level: "invalid" }), /level/);
});

test("voice tools validate before execution and preserve cancellation", async () => {
  const bus = new EventEmitter(), calls = [];
  const pi = { events: { on(name, fn) { bus.on(name, fn); return () => bus.off(name, fn); },
    emit: (name, value) => bus.emit(name, value) } };
  registerGippityVoiceTool(pi, { name: "fixture", description: "Fixture",
    parameters: Type.Object({ count: Type.Integer() }),
    execute: args => { calls.push(args); return args; } });
  const registry = collectGippityVoiceTools(pi);
  const ctx = { signal: new AbortController().signal, callId: "voice", ctx: {} };
  assert.deepEqual(await registry.execute("fixture", { count: "2" }, ctx), { count: 2 });
  await assert.rejects(registry.execute("fixture", { count: "invalid" }, ctx), /count/);
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  await assert.rejects(registry.execute("fixture", { count: 3 }, { ...ctx, signal: controller.signal }), /cancelled/);
  assert.deepEqual(calls, [{ count: 2 }]);
});
