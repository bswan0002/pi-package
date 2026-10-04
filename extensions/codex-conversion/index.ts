import conversion from "@howaboua/pi-codex-conversion";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerConversionFastDisplay } from "../shared/fast-state";

// Load the same pinned, patched dependency used by our integration APIs.
// Do not also enable a separately installed pi-codex-conversion extension.
export default async function bundledConversion(pi: ExtensionAPI): Promise<void> {
	const dispose = registerConversionFastDisplay(pi);
	try {
		await conversion(pi);
	} catch (error) {
		dispose();
		throw error;
	}
}
