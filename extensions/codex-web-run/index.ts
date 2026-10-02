import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Upstream ships executable TS with its own compiler assumptions. Keep that
// source outside our typecheck, just as its optional conversion import does.
const PACKAGE = "@howaboua/pi-codex-web-run";
export default async function bundledWebRun(pi: ExtensionAPI): Promise<void> {
	const { default: extension } = await import(PACKAGE);
	await extension(pi);
}
