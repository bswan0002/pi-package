import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type FastDisplayStore = { fastLabel?: string; listeners: Set<() => void> };
const GLOBAL_KEY = Symbol.for("bswan0002.pi-package.fast-state");
const globalStore = globalThis as typeof globalThis & { [GLOBAL_KEY]?: FastDisplayStore };
const store = globalStore[GLOBAL_KEY] ?? (globalStore[GLOBAL_KEY] = { listeners: new Set() });

export function getFastState(): { fastLabel?: string } {
	return { fastLabel: store.fastLabel };
}

export function onFastStateChange(listener: () => void): () => void {
	store.listeners.add(listener);
	return () => store.listeners.delete(listener);
}

/** Display only: conversion remains authoritative for config and transport. */
export function registerConversionFastDisplay(pi: ExtensionAPI): () => void {
	const update = (fastLabel?: string) => {
		if (store.fastLabel === fastLabel) return;
		store.fastLabel = fastLabel;
		for (const listener of store.listeners) listener();
	};
	const off = pi.events.on("pi-package:codex-fast-state", (value: unknown) => {
		if (!value || typeof value !== "object") return;
		const state = value as { active?: unknown; fast?: unknown; tier?: unknown };
		if (typeof state.active !== "boolean" || typeof state.fast !== "boolean") return;
		update(state.active && state.fast ? state.tier === "ultrafast" ? "ultrafast" : "fast" : undefined);
	});
	const dispose = () => { off(); update(); };
	pi.on("session_shutdown", dispose);
	return dispose;
}
