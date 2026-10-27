import assert from "node:assert/strict";
import test from "node:test";
import { AssistantMessageEventStream, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { createCodexTransportStream } from "@howaboua/pi-codex-conversion/dist/providers/openai-codex/transport-recovery.js";

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
