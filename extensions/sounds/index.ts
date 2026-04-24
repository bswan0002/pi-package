import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const AGENT_END_SOUND = "/System/Library/Sounds/Glass.aiff";
const PERMISSION_PROMPT_SOUND = "/System/Library/Sounds/Ping.aiff";
const PERMISSION_PROMPT_EVENT = "bswan0002:readonly-git-permissions:confirm-needed";

async function playSound(pi: ExtensionAPI, soundPath: string) {
	try {
		await pi.exec("afplay", [soundPath]);
	} catch {
		// Ignore sound playback failures.
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("agent_end", async () => {
		await playSound(pi, AGENT_END_SOUND);
	});

	pi.events.on(PERMISSION_PROMPT_EVENT, async () => {
		await playSound(pi, PERMISSION_PROMPT_SOUND);
	});
}
