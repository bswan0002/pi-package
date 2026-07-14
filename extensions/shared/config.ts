import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type PiPackageConfig = {
	screenshotPicker?: { sources?: string[] };
	sounds?: {
		piEvents?: Record<string, string>;
		extensionEvents?: Record<string, string>;
	};
	readonlyGitPermissions?: {
		explainer?: {
			enabled?: boolean;
			provider?: string;
			model?: string;
		};
	};
	diff?: { theme?: string; colors?: Record<string, string> };
	style?: { icons?: Record<string, string>; colors?: Record<string, string> };
};

export const globalSettingsPath = join(homedir(), ".pi", "agent", "settings.json");
export const projectSettingsPath = join(process.cwd(), ".pi", "settings.json");

function readJson(path: string): any | undefined {
	try {
		if (!existsSync(path)) return undefined;
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

function mergeConfig(base: PiPackageConfig, override: PiPackageConfig): PiPackageConfig {
	return {
		...base,
		...override,
		screenshotPicker: { ...(base.screenshotPicker ?? {}), ...(override.screenshotPicker ?? {}) },
		sounds: {
			...(base.sounds ?? {}),
			...(override.sounds ?? {}),
			piEvents: { ...(base.sounds?.piEvents ?? {}), ...(override.sounds?.piEvents ?? {}) },
			extensionEvents: { ...(base.sounds?.extensionEvents ?? {}), ...(override.sounds?.extensionEvents ?? {}) },
		},
		readonlyGitPermissions: {
			...(base.readonlyGitPermissions ?? {}),
			...(override.readonlyGitPermissions ?? {}),
			explainer: {
				...(base.readonlyGitPermissions?.explainer ?? {}),
				...(override.readonlyGitPermissions?.explainer ?? {}),
			},
		},
		diff: {
			...(base.diff ?? {}),
			...(override.diff ?? {}),
			colors: { ...(base.diff?.colors ?? {}), ...(override.diff?.colors ?? {}) },
		},
		style: {
			...(base.style ?? {}),
			...(override.style ?? {}),
			icons: { ...(base.style?.icons ?? {}), ...(override.style?.icons ?? {}) },
			colors: { ...(base.style?.colors ?? {}), ...(override.style?.colors ?? {}) },
		},
	};
}

export function loadPiPackageConfig(): PiPackageConfig {
	const globalConfig = (readJson(globalSettingsPath)?.piPackage ?? {}) as PiPackageConfig;
	const projectConfig = (readJson(projectSettingsPath)?.piPackage ?? {}) as PiPackageConfig;
	return mergeConfig(globalConfig, projectConfig);
}

export function hasSoundsConfig(): boolean {
	return Boolean(readJson(globalSettingsPath)?.piPackage?.sounds || readJson(projectSettingsPath)?.piPackage?.sounds);
}

export function bootstrapGlobalSoundsConfig(sounds: NonNullable<PiPackageConfig["sounds"]>): void {
	try {
		const settings = readJson(globalSettingsPath) ?? {};
		settings.piPackage = { ...(settings.piPackage ?? {}), sounds };
		mkdirSync(dirname(globalSettingsPath), { recursive: true });
		writeFileSync(globalSettingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
	} catch {
		// Non-disruptive bootstrap.
	}
}
