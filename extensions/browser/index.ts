import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Load the lazy extension entry; the package root also eagerly exports browser tools.
const PACKAGE = "@howaboua/pi-browser";
export default async function bundledBrowser(pi: ExtensionAPI): Promise<void> {
	const { default: extension } = await import(new URL("./extension.js", import.meta.resolve(PACKAGE)).href);
	await extension(pi);
}
