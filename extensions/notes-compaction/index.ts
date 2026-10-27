import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PACKAGE = "@howaboua/pi-notes-compaction";
export default async function bundledNotes(pi: ExtensionAPI): Promise<void> {
	const { default: extension } = await import(PACKAGE);
	await extension(pi);
}
