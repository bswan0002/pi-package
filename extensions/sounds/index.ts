import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadPiPackageConfig, hasSoundsConfig, bootstrapGlobalSoundsConfig } from "../shared/config";
import { EVENTS } from "../shared/events";

const DEFAULT_SOUNDS = {
	piEvents: {
		agent_end: "/System/Library/Sounds/Glass.aiff",
	},
	extensionEvents: {
		[EVENTS.READONLY_GIT_CONFIRM_NEEDED]: "/System/Library/Sounds/Ping.aiff",
	},
};

function expandPath(path: string): string {
	return path === "~" ? homedir() : path.startsWith("~/") ? `${homedir()}${path.slice(1)}` : path;
}

async function playSound(pi: ExtensionAPI, soundPath: string) {
	try {
		const expanded = expandPath(soundPath);
		if (!existsSync(expanded)) return;
		await pi.exec("afplay", [expanded]);
	} catch {
		// Ignore sound playback failures.
	}
}

export default function (pi: ExtensionAPI) {
	if (!hasSoundsConfig()) bootstrapGlobalSoundsConfig(DEFAULT_SOUNDS);
	const sounds = loadPiPackageConfig().sounds ?? {};

	for (const [eventName, soundPath] of Object.entries(sounds.piEvents ?? {})) {
		if (typeof soundPath !== "string") continue;
		try {
			pi.on(eventName as any, async () => playSound(pi, soundPath));
		} catch {
			// Ignore unsupported event names.
		}
	}

	for (const [eventName, soundPath] of Object.entries(sounds.extensionEvents ?? {})) {
		if (typeof soundPath !== "string") continue;
		try {
			pi.events.on(eventName, async () => playSound(pi, soundPath));
		} catch {
			// Ignore unsupported event names.
		}
	}
}
