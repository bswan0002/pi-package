import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type BetterOpenAIState = {
	fastLabel?: string;
};

type BetterOpenAIGlobalState = {
	state: BetterOpenAIState;
	conversionFast?: boolean;
	listeners: Set<() => void>;
};

const GLOBAL_KEY = Symbol.for("bswan0002.pi-package.better-openai-state");
const globalStore = globalThis as typeof globalThis & {
	[GLOBAL_KEY]?: BetterOpenAIGlobalState;
};

const store =
	globalStore[GLOBAL_KEY] ??
	(globalStore[GLOBAL_KEY] = {
		state: {},
		listeners: new Set<() => void>(),
	});

export function getBetterOpenAIState(): BetterOpenAIState {
	return { fastLabel: store.conversionFast === undefined ? store.state.fastLabel : store.conversionFast ? "fast" : undefined };
}

export function setBetterOpenAIState(next: BetterOpenAIState): void {
	const changed = store.state.fastLabel !== next.fastLabel;
	store.state.fastLabel = next.fastLabel;
	if (!changed) return;
	for (const listener of store.listeners) listener();
}

export function onBetterOpenAIStateChange(listener: () => void): () => void {
	store.listeners.add(listener);
	return () => store.listeners.delete(listener);
}

/** Display-only bridge: conversion remains authoritative for config and transport. */
export function registerConversionFastDisplay(pi: ExtensionAPI): () => void {
	const update = (fast: boolean | undefined) => {
		if (store.conversionFast === fast) return;
		store.conversionFast = fast;
		for (const listener of store.listeners) listener();
	};
	const off = pi.events.on("pi-package:codex-fast-state", (value: unknown) => {
		if (!value || typeof value !== "object") return;
		const state = value as { active?: unknown; fast?: unknown };
		if (typeof state.active !== "boolean" || typeof state.fast !== "boolean") return;
		update(state.active ? state.fast : undefined);
	});
	const dispose = () => { off(); update(undefined); };
	pi.on("session_shutdown", dispose);
	return dispose;
}
