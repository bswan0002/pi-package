export type BetterOpenAIState = {
	fastLabel?: string;
};

type BetterOpenAIGlobalState = {
	state: BetterOpenAIState;
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
	return { ...store.state };
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
