import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { adaptToolForCodeMode, registerCodeModeExtensionTools } from "@howaboua/pi-codex-conversion/code-mode";
import { STATUS_KEY } from "../better-openai/src/identity";

/** Sample after factories have loaded, not from package installation or config files. */
export function hasCodexConversion(pi: ExtensionAPI): boolean {
	return pi.getCommands().some((command) => command.name === "codex" && command.source === "extension");
}

export function conversionOwnsFast(pi: ExtensionAPI, ctx: Pick<ExtensionContext, "model">): boolean {
	return hasCodexConversion(pi) && (ctx.model?.api === "openai-codex-responses" ||
		(ctx.model?.api === "openai-responses" && pi.getActiveTools().includes("exec_command")) ||
		(ctx.model?.api === "openai-responses" && pi.getActiveTools().includes("exec")));
}

/** Filter only at rendering: status removal immediately restores our quota row. */
export function visibleExtensionStatuses(statuses: ReadonlyMap<string, string>): [string, string][] {
	const adapterVisible = Boolean(statuses.get("codex-adapter")?.trim());
	return [...statuses].filter(([key]) => !adapterVisible || key !== STATUS_KEY);
}

/** The dependency is bundled, but its extension need not be enabled. Brokers handle either load order. */
export function registerCompatibleTool<T extends TSchema, D, S>(
	pi: ExtensionAPI,
	tool: ToolDefinition<T, D, S>,
): void {
	pi.registerTool(tool);
	const registration = registerCodeModeExtensionTools(pi, () => [adaptToolForCodeMode(tool, {
		usage: `await tools.${tool.name}(input) — ${tool.description}`,
		blocking: tool.name === "ask_user_question",
	})]);
	pi.on("session_shutdown", () => registration.unregister());
}
