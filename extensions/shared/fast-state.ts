import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type FastDisplayStore = { fast: boolean; listeners: Set<() => void> };
const GLOBAL_KEY = Symbol.for("bswan0002.pi-package.fast-state");
const globalStore = globalThis as typeof globalThis & { [GLOBAL_KEY]?: FastDisplayStore };
const store = globalStore[GLOBAL_KEY] ?? (globalStore[GLOBAL_KEY] = { fast: false, listeners: new Set() });

export function getFastState(): { fastLabel?: string } {
	return { fastLabel: store.fast ? "fast" : undefined };
}

export function onFastStateChange(listener: () => void): () => void {
	store.listeners.add(listener);
	return () => store.listeners.delete(listener);
}

/** Display only: conversion remains authoritative for config and transport. */
export function registerConversionFastDisplay(pi: ExtensionAPI): () => void {
	const update = (fast: boolean) => {
		if (store.fast === fast) return;
		store.fast = fast;
		for (const listener of store.listeners) listener();
	};
	const off = pi.events.on("pi-package:codex-fast-state", (value: unknown) => {
		if (!value || typeof value !== "object") return;
		const state = value as { active?: unknown; fast?: unknown };
		if (typeof state.active !== "boolean" || typeof state.fast !== "boolean") return;
		update(state.active && state.fast);
	});
	const dispose = () => { off(); update(false); };
	pi.on("session_shutdown", dispose);
	return dispose;
}
