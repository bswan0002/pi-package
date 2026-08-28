import type { Theme } from "@earendil-works/pi-coding-agent";
import { getKeybindings, type Input } from "@earendil-works/pi-tui";
import { type QuestionData, type QuestionnaireResult, type QuestionParams, SENTINEL_LABELS } from "../tool/types";
import type { WrappingSelectItem } from "../view/components/wrapping-select";
import type { QuestionnairePropsAdapter } from "../view/props-adapter";
import { buildQuestionnaire } from "./build-questionnaire";
import { InputBuffer } from "./input-buffer";
import { type QuestionnaireAction, routeKey } from "./key-router";
import { computeFocusedOptionHasPreview } from "./selectors/derivations";
import type { QuestionnaireRuntime, QuestionnaireState } from "./state";
import { type ApplyContext, type Effect, reduce } from "./state-reducer";

const BACKSPACE_CHARS = new Set(["\x7f", "\b"]);
const ESC_SEQUENCE_PREFIX = "\x1b";

export interface QuestionnaireSessionConfig {
	tui: { terminal: { columns: number }; requestRender(): void };
	theme: Theme;
	params: QuestionParams;
	itemsByTab: WrappingSelectItem[][];
	done: (result: QuestionnaireResult) => void;
}

export interface QuestionnaireSessionComponent {
	render(width: number): string[];
	invalidate(): void;
	handleInput(data: string): void;
}

function initialState(): QuestionnaireState {
	return {
		currentTab: 0,
		optionIndex: 0,
		inputMode: false,
		notesVisible: false,
		chatFocused: false,
		answers: new Map(),
		multiSelectChecked: new Set(),
		notesByTab: new Map(),
		focusedOptionHasPreview: false,
		submitChoiceIndex: 0,
		notesDraft: "",
	};
}

/**
 * Slim runtime: owns the canonical state cell, the input-buffer cell, the
 * two-pass `notesVisible` dispatch loop, and the effect runner. State
 * transitions go through the pure `reduce` reducer; UI fan-out goes through
 * the `QuestionnairePropsAdapter` produced by `buildQuestionnaire`.
 */
export class QuestionnaireSession {
	private state: QuestionnaireState = initialState();
	private readonly inputBuffer = new InputBuffer();

	private readonly questions: readonly QuestionData[];
	private readonly isMulti: boolean;
	private readonly itemsByTab: WrappingSelectItem[][];

	private readonly notesInput: Input;
	private readonly viewAdapter: QuestionnairePropsAdapter;

	private readonly tui: QuestionnaireSessionConfig["tui"];
	private readonly done: QuestionnaireSessionConfig["done"];

	readonly component: QuestionnaireSessionComponent;

	constructor(config: QuestionnaireSessionConfig) {
		this.tui = config.tui;
		this.done = config.done;
		this.questions = config.params.questions;
		this.isMulti = this.questions.length > 1;
		this.itemsByTab = config.itemsByTab;
		// Seed from the focused option at start; the reducer keeps it in sync via withFocusedOptionHasPreview.
		this.state = { ...this.state, focusedOptionHasPreview: computeFocusedOptionHasPreview(this.questions, 0, 0) };

		const built = buildQuestionnaire({
			tui: this.tui,
			theme: config.theme,
			questions: this.questions,
			itemsByTab: this.itemsByTab,
			isMulti: this.isMulti,
			initialState: this.state,
			inputBuffer: this.inputBuffer,
			getCurrentTab: () => this.state.currentTab,
		});

		this.notesInput = built.notesInput;
		this.viewAdapter = built.adapter;

		this.component = {
			render: built.render,
			invalidate: built.invalidate,
			handleInput: (data) => this.dispatch(data),
		};

		this.viewAdapter.apply(this.state);
	}

	dispatch(data: string): void {
		const action = routeKey(data, this.state, this.runtime());
		if (action.kind === "ignore") {
			this.handleIgnoreInline(data);
			return;
		}
		this.commit(action);
	}

	private commit(action: QuestionnaireAction): void {
		const result = reduce(this.state, action, this.applyContext());
		this.state = result.state;
		for (const effect of result.effects) this.runEffect(effect);
		this.state = this.mirrorNotesDraft(this.state);
		this.viewAdapter.apply(this.state);
	}

	private mirrorNotesDraft(s: QuestionnaireState): QuestionnaireState {
		const draft = this.notesInput.getValue();
		return s.notesDraft === draft ? s : { ...s, notesDraft: draft };
	}

	private runEffect(effect: Effect): void {
		switch (effect.kind) {
			case "set_input_buffer":
				this.inputBuffer.set(effect.value);
				return;
			case "clear_input_buffer":
				this.inputBuffer.clear();
				return;
			case "set_notes_value":
				this.notesInput.setValue(effect.value);
				return;
			case "set_notes_focused":
				this.notesInput.focused = effect.focused;
				return;
			case "forward_notes_keystroke":
				this.notesInput.handleInput(effect.data);
				return;
			case "done":
				this.done(effect.result);
				return;
		}
	}

	/**
	 * Per-keystroke `ignore` fast path: mutates the session-owned input buffer
	 * directly (no reducer pass) and re-runs `viewAdapter.apply(state)` so the
	 * new buffer value flows out via `selectOptionListProps`.
	 */
	private handleIgnoreInline(data: string): void {
		if (!this.state.inputMode) return;
		if (BACKSPACE_CHARS.has(data)) {
			this.inputBuffer.backspace();
			this.viewAdapter.apply(this.state);
		} else if (data && !data.startsWith(ESC_SEQUENCE_PREFIX)) {
			this.inputBuffer.append(data);
			this.viewAdapter.apply(this.state);
		}
	}

	private runtime(): QuestionnaireRuntime {
		return {
			keybindings: getKeybindings(),
			inputBuffer: this.inputBuffer.get(),
			questions: this.questions,
			isMulti: this.isMulti,
			currentItem: this.currentItem(),
			items: this.itemsByTab[this.state.currentTab] ?? [],
		};
	}

	private applyContext(): ApplyContext {
		return {
			questions: this.questions,
			itemsByTab: this.itemsByTab,
		};
	}

	private currentItem(): WrappingSelectItem | undefined {
		if (this.state.chatFocused) return { kind: "chat", label: SENTINEL_LABELS.chat };
		const arr = this.itemsByTab[this.state.currentTab] ?? [];
		if (this.state.optionIndex < arr.length) return arr[this.state.optionIndex];
		return { kind: "chat", label: SENTINEL_LABELS.chat };
	}
}
