import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { conversionOwnsFast } from "../shared/codex-conversion";

/** Dispatch only: each provider integration owns its settings and transport. */
export default function fast(pi: ExtensionAPI): void {
	pi.registerCommand("fast", {
		description: "Toggle fast mode through the current model's provider integration",
		handler: async (args, ctx) => {
			if (args.trim()) {
				ctx.ui.notify("Usage: /fast", "error");
				return;
			}
			if (!conversionOwnsFast(pi, ctx)) {
				ctx.ui.notify("Fast mode is not supported by the current model's loaded integration.", "warning");
				return;
			}
			pi.sendUserMessage("/codex fast", { expandPromptTemplates: true });
		},
	});
}
