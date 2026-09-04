import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CODEX_CONVERSION_CONFIG } from "@howaboua/pi-codex-conversion/dist/adapter/activation/config.js";
import {
  closeOpenAICodexWebSocketSessions,
  registerOpenAICodexCustomProvider,
} from "@howaboua/pi-codex-conversion/dist/providers/openai-codex-custom-provider.js";

/**
 * Replace pi's stock Codex transport so Fast Mode can set the complete ChatGPT
 * routing contract on SSE, WebSocket, retries, and cached continuations.
 */
export interface FastCodexProviderController {
  reset(sessionId: string): void;
}

export function registerFastCodexProvider(
  pi: ExtensionAPI,
  isFastActive: () => boolean,
): FastCodexProviderController {
  // Keep Pi's refreshable catalog (and models.json overrides). The conversion
  // provider's static models would replace it, hiding newly released models and
  // overriding current reasoning, tool, context-window, and pricing metadata.
  const providerAPI: ExtensionAPI = {
    ...pi,
    registerProvider(name, config?: ProviderConfig) {
      if (typeof name !== "string") {
        pi.registerProvider(name);
        return;
      }
      if (!config) throw new Error("Missing provider configuration");
      if (name === "openai-codex") {
        const { models: _models, ...transportConfig } = config;
        pi.registerProvider(name, transportConfig);
        return;
      }
      pi.registerProvider(name, config);
    },
  };
  registerOpenAICodexCustomProvider(providerAPI, {
    getConfig: () => ({
      executionMode: "normal",
      openai: {
        ...DEFAULT_CODEX_CONVERSION_CONFIG.openai,
        fast: isFastActive(),
      },
      compaction: DEFAULT_CODEX_CONVERSION_CONFIG.compaction,
    }),
    useResponsesLite: () => false,
  });

  pi.on("model_select", (event, ctx) => {
    if (event.previousModel?.provider === "openai-codex") {
      closeOpenAICodexWebSocketSessions(ctx.sessionManager.getSessionId());
    }
  });

  pi.on("session_shutdown", () => {
    closeOpenAICodexWebSocketSessions();
  });

  return {
    reset: closeOpenAICodexWebSocketSessions,
  };
}
