import assert from "node:assert/strict";
import test from "node:test";
import { AssistantMessageEventStream, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { createCodexTransportStream } from "@howaboua/pi-codex-conversion/dist/providers/openai-codex/transport-recovery.js";
import { routeContextNamespaceToolStream } from "@howaboua/pi-codex-conversion/dist/context-management/namespace-tools.js";

const model = { api: "openai-codex-responses", provider: "openai-codex", id: "gpt-6-luna" };

// No credentials or network: exercise conversion's actual transport failure path.
test("conversion transport returns Pi's timed stream for errors and cancellation", async () => {
  for (const aborted of [false, true]) {
    const controller = new AbortController();
    if (aborted) controller.abort();
    const stream = createCodexTransportStream(model, { messages: [] }, { signal: controller.signal }, {
      prepareRequestBody: () => assert.fail("missing credentials must stop before preparing a request"),
    });
    assert.ok(stream instanceof AssistantMessageEventStream);
    const events = [];
    for await (const event of stream) events.push(event);
    const result = await stream.result();
    assert.equal(result.stopReason, aborted ? "aborted" : "error");
    assert.match(result.errorMessage, /No API key/);
    assert.equal(events.at(-1).error, result);
    assert.ok(Number.isFinite(result.durationMs) && result.durationMs >= 0);
  }
});

test("conversion's context router preserves tool calls and recorded response duration", async () => {
  for (const stopReason of ["toolUse", "error", "aborted"]) {
    const source = createAssistantMessageEventStream();
    const routed = routeContextNamespaceToolStream(source);
    assert.ok(routed instanceof AssistantMessageEventStream);
    const message = {
      role: "assistant", ...model, model: model.id, timestamp: Date.now(), durationMs: 123.5,
      stopReason, content: [{ type: "toolCall", id: "notes-1", namespace: "notes", name: "write_file", arguments: { path: "context.md", text: "Keep this note" } }],
    };
    source.push(stopReason === "toolUse"
      ? { type: "done", reason: stopReason, message }
      : { type: "error", reason: stopReason, error: message });
    const events = [];
    for await (const event of routed) events.push(event);
    const result = await routed.result();
    assert.equal(result.durationMs, 123.5);
    assert.equal(result.stopReason, stopReason);
    assert.equal(result.content[0].name, "notes");
    assert.deepEqual(result.content[0].arguments, { action: "write_file", path: "context.md", text: "Keep this note" });
    assert.equal(message.content[0].name, "write_file", "routing must not mutate the source message");
    assert.equal(events.at(-1)[stopReason === "toolUse" ? "message" : "error"], result);
  }
});
