import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { adaptToolForCodeMode, registerCodeModeExtensionTools, type CodeModeExtensionToolRegistrationOptions } from "@howaboua/pi-codex-conversion/code-mode";

/** Sample after factories have loaded, not from package installation or config files. */
export function hasCodexConversion(pi: ExtensionAPI): boolean {
	return pi.getCommands().some((command) => command.name === "codex" && command.source === "extension");
}

/** Match transport as well as provider name, including renamed Codex providers. */
export function isCodexModel(ctx: Pick<ExtensionContext, "model">): boolean {
	return ctx.model?.api === "openai-codex-responses" || ctx.model?.provider === "openai-codex";
}

export function conversionOwnsFast(pi: ExtensionAPI, ctx: Pick<ExtensionContext, "model">): boolean {
	return hasCodexConversion(pi) && (ctx.model?.api === "openai-codex-responses" ||
		(ctx.model?.api === "openai-responses" && pi.getActiveTools().includes("exec_command")) ||
		(ctx.model?.api === "openai-responses" && pi.getActiveTools().includes("exec")));
}

/** The dependency is bundled, but its extension need not be enabled. Brokers handle either load order. */
export function registerCompatibleTool<T extends TSchema, D, S>(
	pi: ExtensionAPI,
	tool: ToolDefinition<T, D, S>,
	options?: CodeModeExtensionToolRegistrationOptions,
): void {
	pi.registerTool(tool);
	const registration = registerCodeModeExtensionTools(pi, () => [adaptToolForCodeMode(tool, {
		usage: `await tools.${tool.name}(input) — ${tool.description}`,
		blocking: tool.name === "ask_user_question",
	})], options);
	pi.on("session_shutdown", () => registration.unregister());
}
