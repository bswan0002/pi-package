import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PACKAGE = "@howaboua/pi-browser";
export default async function bundledBrowser(pi: ExtensionAPI): Promise<void> {
	const { default: extension } = await import(PACKAGE);
	await extension(pi);
}
