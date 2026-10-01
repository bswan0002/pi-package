import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PACKAGE = "@howaboua/pi-codex-imagegen";
export default async function bundledImagegen(pi: ExtensionAPI): Promise<void> {
	const { default: extension } = await import(PACKAGE);
	await extension(pi);
}
