import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Sample after factories have loaded, not from package installation or config files. */
export function hasCodexConversion(pi: ExtensionAPI): boolean {
	return pi.getCommands().some((command) => command.name === "codex" && command.source === "extension");
}

export function conversionOwnsFast(pi: ExtensionAPI, ctx: Pick<ExtensionContext, "model">): boolean {
	return hasCodexConversion(pi) && (ctx.model?.api === "openai-codex-responses" ||
		(ctx.model?.api === "openai-responses" && pi.getActiveTools().includes("exec_command")) ||
		(ctx.model?.api === "openai-responses" && pi.getActiveTools().includes("exec")));
}
