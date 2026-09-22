import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CODEX_CONVERSION_CONFIG } from "@howaboua/pi-codex-conversion/dist/adapter/activation/config.js";
import {
  closeOpenAICodexWebSocketSessions,
  registerOpenAICodexCustomProvider,
} from "@howaboua/pi-codex-conversion/dist/providers/openai-codex-custom-provider.js";

/**
 * Replace Pi's stock Codex transport so Fast Mode requests priority processing
 * across SSE, WebSocket, retries, and cached continuations.
 */
export interface FastCodexProviderController {
  reset(sessionId: string): void;
}

export function registerFastCodexProvider(
  pi: ExtensionAPI,
): FastCodexProviderController {
  // Keep Pi's refreshable catalog (and models.json overrides). The conversion
  // provider's static models would replace it, hiding newly released models and
  // overriding current reasoning, tool, context-window, and pricing metadata.
  const providerAPI: ExtensionAPI = {
    ...pi,
    registerProvider(name, config?: ProviderConfig) {
      const id = typeof name === "string" ? name : name.id;
      if (id === "openai-codex") {
        const streamSimple = typeof name === "string" ? config?.streamSimple : name.streamSimple;
        if (!streamSimple) throw new Error("Missing Codex transport");
        // A stream-only legacy overlay retains Pi's native auth, catalog refresh,
        // and models.json overrides. Registering the upstream Provider object
        // would instead install its static getModels() and custom OAuth policy.
        // The new transport consumes Pi's transcript directly; do not collapse
        // or strip system messages (including chronological prompt/tool deltas).
        pi.registerProvider(id, { api: "openai-codex-responses", streamSimple });
      } else if (typeof name !== "string") {
        pi.registerProvider(name);
      } else {
        if (!config) throw new Error("Missing provider configuration");
        pi.registerProvider(name, config);
      }
    },
  };
  registerOpenAICodexCustomProvider(providerAPI, {
    getConfig: () => ({
      executionMode: "normal",
      // Priority is injected by index.ts's before_provider_request handler.
      // The transport no longer uses openai.fast to change routing identity.
      openai: DEFAULT_CODEX_CONVERSION_CONFIG.openai,
      compaction: DEFAULT_CODEX_CONVERSION_CONFIG.compaction,
    }),
    useResponsesLite: () => false,
  });

  pi.on("model_select", (event, ctx) => {
    if (event.previousModel?.provider === "openai-codex") {
      closeOpenAICodexWebSocketSessions(ctx.sessionManager.getSessionId());
    }
  });

  // Codex cannot honor Pi's one-token cache-warming cap. An idle generation
  // would spend quota and could disturb the live WebSocket continuation.
  pi.on("cache_warming_decision", (_event, ctx) => {
    if (ctx.model?.provider === "openai-codex") return { action: "stop" };
  });

  pi.on("session_shutdown", () => {
    closeOpenAICodexWebSocketSessions();
  });

  return {
    reset: closeOpenAICodexWebSocketSessions,
  };
}
