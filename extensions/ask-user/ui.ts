import type { Theme } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import {
	Container,
	type Component,
	decodeKittyPrintable,
	Editor,
	type EditorTheme,
	fuzzyFilter,
	Key,
	type Keybinding,
	type KeybindingsManager,
	Markdown,
	type MarkdownTheme,
	matchesKey,
	Spacer,
	Text,
	type TUI,
	type OverlayOptions,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import { renderSingleSelectRows } from "./single-select-layout";
import { createFreeformResponse, createSelectionResponse } from "./format";
import type { AskDisplayMode, AskUIResult, QuestionOption } from "./types";

function createSelectListTheme(theme: Theme) {
	return {
		selectedPrefix: (t: string) => theme.fg("accent", t),
		selectedText: (t: string) => theme.fg("accent", t),
		description: (t: string) => theme.fg("muted", t),
		scrollInfo: (t: string) => theme.fg("dim", t),
		noMatch: (t: string) => theme.fg("warning", t),
	};
}

function createEditorTheme(theme: Theme): EditorTheme {
	return {
		borderColor: (s: string) => theme.fg("accent", s),
		selectList: createSelectListTheme(theme),
	};
}

const BOX_BORDER_LEFT = "│ ";
const BOX_BORDER_RIGHT = " │";
const BOX_BORDER_OVERHEAD = BOX_BORDER_LEFT.length + BOX_BORDER_RIGHT.length;

class BoxBorderTop implements Component {
	private color: (s: string) => string;
	private title?: string;
	private titleColor?: (s: string) => string;
	constructor(color: (s: string) => string, title?: string, titleColor?: (s: string) => string) {
		this.color = color;
		this.title = title;
		this.titleColor = titleColor;
	}
	invalidate(): void { }
	render(width: number): string[] {
		const inner = Math.max(0, width - 2);
		if (!this.title || inner < this.title.length + 4) {
			return [this.color(`╭${"─".repeat(inner)}╮`)];
		}
		const label = ` ${this.title} `;
		const remaining = inner - 1 - label.length;
		const titleStyle = this.titleColor ?? this.color;
		return [
			this.color("╭─") + titleStyle(label) + this.color("─".repeat(Math.max(0, remaining)) + "╮"),
		];
	}
}

class BoxBorderBottom implements Component {
	private color: (s: string) => string;
	private label?: string;
	private labelColor?: (s: string) => string;
	constructor(color: (s: string) => string, label?: string, labelColor?: (s: string) => string) {
		this.color = color;
		this.label = label;
		this.labelColor = labelColor;
	}
	invalidate(): void { }
	render(width: number): string[] {
		const inner = Math.max(0, width - 2);
		if (!this.label || inner < this.label.length + 4) {
			return [this.color(`╰${"─".repeat(inner)}╯`)];
		}
		const tag = ` ${this.label} `;
		const leftDashes = inner - tag.length - 1;
		const style = this.labelColor ?? this.color;
		return [
			this.color("╰" + "─".repeat(Math.max(0, leftDashes))) + style(tag) + this.color("─╯"),
		];
	}
}

function formatKeyList(keys: string[]): string {
	return keys.join("/");
}

function keybindingHint(
	theme: Theme,
	keybindings: KeybindingsManager,
	keybinding: Keybinding,
	description: string,
): string {
	return `${theme.fg("dim", formatKeyList(keybindings.getKeys(keybinding)))}${theme.fg("muted", ` ${description}`)}`;
}

function literalHint(theme: Theme, key: string, description: string): string {
	return `${theme.fg("dim", key)}${theme.fg("muted", ` ${description}`)}`;
}

function isCommentToggleKey(data: string): boolean {
	return matchesKey(data, Key.ctrl("g"));
}

type AskMode = "select" | "freeform" | "comment";

export const ASK_OVERLAY_MAX_HEIGHT_RATIO = 0.85;
export const ASK_OVERLAY_WIDTH = "92%";
export const ASK_OVERLAY_MIN_WIDTH = 40;
export const SINGLE_SELECT_SPLIT_PANE_MIN_WIDTH = 84;
export const SINGLE_SELECT_SPLIT_PANE_LEFT_MIN_WIDTH = 32;
export const SINGLE_SELECT_SPLIT_PANE_RIGHT_MIN_WIDTH = 28;
export const SINGLE_SELECT_SPLIT_PANE_SEPARATOR = " │ ";
export const FREEFORM_SENTINEL = "\u270f\ufe0f Type custom response...";
export const COMMENT_TOGGLE_LABEL = "Add extra context after selection";

export function buildCustomUIOptions(displayMode: AskDisplayMode): { overlay?: boolean; overlayOptions?: OverlayOptions } | undefined {
	switch (displayMode) {
		case "inline":
			return undefined;
		case "overlay":
			return {
				overlay: true,
				overlayOptions: {
					anchor: "center" as const,
					width: ASK_OVERLAY_WIDTH as `${number}%`,
					minWidth: ASK_OVERLAY_MIN_WIDTH,
					maxHeight: "85%" as `${number}%`,
					margin: 1,
				},
			};
		default: {
			const _exhaustive: never = displayMode;
			void _exhaustive;
			return {
				overlay: true,
				overlayOptions: {
					anchor: "center" as const,
					width: ASK_OVERLAY_WIDTH as `${number}%`,
					minWidth: ASK_OVERLAY_MIN_WIDTH,
					maxHeight: "85%" as `${number}%`,
					margin: 1,
				},
			};
		}
	}
}

class MultiSelectList implements Component {
	private options: QuestionOption[];
	private allowFreeform: boolean;
	private allowComment: boolean;
	private theme: Theme;
	private keybindings: KeybindingsManager;
	private selectedIndex = 0;
	private checked = new Set<number>();
	private commentEnabled = false;
	private cachedWidth?: number;
	private cachedLines?: string[];

	public onCancel?: () => void;
	public onSubmit?: (result: string[]) => void;
	public onEnterFreeform?: () => void;

	constructor(
		options: QuestionOption[],
		allowFreeform: boolean,
		allowComment: boolean,
		theme: Theme,
		keybindings: KeybindingsManager,
	) {
		this.options = options;
		this.allowFreeform = allowFreeform;
		this.allowComment = allowComment;
		this.theme = theme;
		this.keybindings = keybindings;
	}

	public isCommentEnabled(): boolean {
		return this.commentEnabled;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private getItemCount(): number {
		return this.options.length + (this.allowComment ? 1 : 0) + (this.allowFreeform ? 1 : 0);
	}

	private getCommentToggleIndex(): number | null {
		return this.allowComment ? this.options.length : null;
	}

	private getFreeformIndex(): number {
		return this.options.length + (this.allowComment ? 1 : 0);
	}

	private isCommentToggleRow(index: number): boolean {
		const toggleIndex = this.getCommentToggleIndex();
		return toggleIndex !== null && index === toggleIndex;
	}

	private isFreeformRow(index: number): boolean {
		return this.allowFreeform && index === this.getFreeformIndex();
	}

	private toggle(index: number): void {
		if (index < 0 || index >= this.options.length) return;
		if (this.checked.has(index)) this.checked.delete(index);
		else this.checked.add(index);
	}

	private toggleComment(): void {
		if (!this.allowComment) return;
		this.commentEnabled = !this.commentEnabled;
		this.invalidate();
	}

	handleInput(data: string): void {
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.onCancel?.();
			return;
		}

		const count = this.getItemCount();
		if (count === 0) {
			this.onCancel?.();
			return;
		}

		if (this.allowComment && isCommentToggleKey(data)) {
			this.toggleComment();
			return;
		}

		if (this.keybindings.matches(data, "tui.select.up") || matchesKey(data, Key.shift("tab"))) {
			this.selectedIndex = this.selectedIndex === 0 ? count - 1 : this.selectedIndex - 1;
			this.invalidate();
			return;
		}

		if (this.keybindings.matches(data, "tui.select.down") || matchesKey(data, Key.tab)) {
			this.selectedIndex = this.selectedIndex === count - 1 ? 0 : this.selectedIndex + 1;
			this.invalidate();
			return;
		}

		const numMatch = data.match(/^[1-9]$/);
		if (numMatch) {
			const idx = Number.parseInt(numMatch[0], 10) - 1;
			if (idx >= 0 && idx < this.options.length) {
				this.toggle(idx);
				this.selectedIndex = Math.min(idx, count - 1);
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, Key.space)) {
			if (this.isCommentToggleRow(this.selectedIndex)) {
				this.toggleComment();
				return;
			}
			if (this.isFreeformRow(this.selectedIndex)) {
				this.onEnterFreeform?.();
				return;
			}
			this.toggle(this.selectedIndex);
			this.invalidate();
			return;
		}

		if (this.keybindings.matches(data, "tui.select.confirm")) {
			if (this.isCommentToggleRow(this.selectedIndex)) {
				this.toggleComment();
				return;
			}
			if (this.isFreeformRow(this.selectedIndex)) {
				this.onEnterFreeform?.();
				return;
			}

			const selectedTitles = Array.from(this.checked)
				.sort((a, b) => a - b)
				.map((i) => this.options[i]?.title)
				.filter((t): t is string => !!t);

			const fallback = this.options[this.selectedIndex]?.title;
			const result = selectedTitles.length > 0 ? selectedTitles : fallback ? [fallback] : [];

			if (result.length > 0) this.onSubmit?.(result);
			else this.onCancel?.();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const theme = this.theme;
		const count = this.getItemCount();
		const maxVisible = Math.min(count, 10);

		if (count === 0) {
			this.cachedLines = [theme.fg("warning", "No options")];
			this.cachedWidth = width;
			return this.cachedLines;
		}

		const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(maxVisible / 2), count - maxVisible));
		const endIndex = Math.min(startIndex + maxVisible, count);

		const lines: string[] = [];

		for (let i = startIndex; i < endIndex; i++) {
			const isSelected = i === this.selectedIndex;
			const prefix = isSelected ? theme.fg("accent", "→") : " ";

			if (this.isCommentToggleRow(i)) {
				const checkbox = this.commentEnabled ? theme.fg("success", "[✓]") : theme.fg("dim", "[ ]");
				const label = isSelected
					? theme.fg("accent", theme.bold(COMMENT_TOGGLE_LABEL))
					: theme.fg("text", theme.bold(COMMENT_TOGGLE_LABEL));
				lines.push(truncateToWidth(`${prefix}   ${checkbox} ${label}`, width, ""));
				continue;
			}

			if (this.isFreeformRow(i)) {
				const label = theme.fg("text", theme.bold("Type something."));
				const desc = theme.fg("muted", "Enter a custom response");
				const line = `${prefix}   ${label} ${theme.fg("dim", "—")} ${desc}`;
				lines.push(truncateToWidth(line, width, ""));
				continue;
			}

			const option = this.options[i];
			if (!option) continue;

			const checkbox = this.checked.has(i) ? theme.fg("success", "[✓]") : theme.fg("dim", "[ ]");
			const num = theme.fg("dim", `${i + 1}.`);
			const title = isSelected
				? theme.fg("accent", theme.bold(option.title))
				: theme.fg("text", theme.bold(option.title));

			const firstLine = `${prefix} ${num} ${checkbox} ${title}`;
			lines.push(truncateToWidth(firstLine, width, ""));

			if (option.description) {
				const indent = "      ";
				const wrapWidth = Math.max(10, width - indent.length);
				const wrapped = wrapTextWithAnsi(option.description, wrapWidth);
				for (const w of wrapped) {
					lines.push(truncateToWidth(indent + theme.fg("muted", w), width, ""));
				}
			}
		}

		if (startIndex > 0 || endIndex < count) {
			lines.push(theme.fg("dim", truncateToWidth(`  (${this.selectedIndex + 1}/${count})`, width, "")));
		}

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}

class WrappedSingleSelectList implements Component {
	private options: QuestionOption[];
	private allowFreeform: boolean;
	private allowComment: boolean;
	private theme: Theme;
	private keybindings: KeybindingsManager;
	private selectedIndex = 0;
	private searchQuery = "";
	private commentEnabled = false;
	private maxVisibleRows = 12;
	private cachedWidth?: number;
	private cachedLines?: string[];

	public onCancel?: () => void;
	public onSubmit?: (result: string) => void;
	public onEnterFreeform?: () => void;

	constructor(
		options: QuestionOption[],
		allowFreeform: boolean,
		allowComment: boolean,
		theme: Theme,
		keybindings: KeybindingsManager,
	) {
		this.options = options;
		this.allowFreeform = allowFreeform;
		this.allowComment = allowComment;
		this.theme = theme;
		this.keybindings = keybindings;
	}

	public isCommentEnabled(): boolean {
		return this.commentEnabled;
	}

	setMaxVisibleRows(rows: number): void {
		const next = Math.max(1, Math.floor(rows));
		if (next !== this.maxVisibleRows) {
			this.maxVisibleRows = next;
			this.invalidate();
		}
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private getFilteredOptions(): QuestionOption[] {
		return fuzzyFilter(this.options, this.searchQuery, (option) => `${option.title} ${option.description ?? ""}`);
	}

	private getItemCount(filteredOptions: QuestionOption[]): number {
		return filteredOptions.length + (this.allowComment ? 1 : 0) + (this.allowFreeform ? 1 : 0);
	}

	private isCommentToggleRow(index: number, filteredOptions: QuestionOption[]): boolean {
		return this.allowComment && index === filteredOptions.length;
	}

	private isFreeformRow(index: number, filteredOptions: QuestionOption[]): boolean {
		return this.allowFreeform && index === filteredOptions.length + (this.allowComment ? 1 : 0);
	}

	private toggleComment(): void {
		if (!this.allowComment) return;
		this.commentEnabled = !this.commentEnabled;
		this.invalidate();
	}

	private setSearchQuery(query: string): void {
		this.searchQuery = query;
		this.selectedIndex = 0;
		this.invalidate();
	}

	private popSearchCharacter(): void {
		if (!this.searchQuery) return;
		const characters = [...this.searchQuery];
		characters.pop();
		this.setSearchQuery(characters.join(""));
	}

	private getPrintableInput(data: string): string | null {
		const kittyPrintable = decodeKittyPrintable(data);
		if (kittyPrintable !== undefined) return kittyPrintable;

		const characters = [...data];
		if (characters.length !== 1) return null;

		const [character] = characters;
		if (!character) return null;

		const code = character.charCodeAt(0);
		if (code < 32 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
			return null;
		}

		return character;
	}

	private styleListLine(line: string, width: number, isSelected: boolean): string {
		const trimmed = line.trim();

		if (trimmed.startsWith("(")) {
			return truncateToWidth(this.theme.fg("dim", line), width, "");
		}

		if (isSelected) {
			return truncateToWidth(this.theme.fg("accent", this.theme.bold(line)), width, "");
		}

		if (line.startsWith("      ")) {
			return truncateToWidth(this.theme.fg("muted", line), width, "");
		}

		if (line.startsWith("→")) {
			return truncateToWidth(this.theme.fg("accent", this.theme.bold(line)), width, "");
		}

		return truncateToWidth(this.theme.fg("text", line), width, "");
	}

	private getSplitPaneWidths(width: number): { left: number; right: number } | null {
		if (width < SINGLE_SELECT_SPLIT_PANE_MIN_WIDTH) return null;

		const availableWidth = width - SINGLE_SELECT_SPLIT_PANE_SEPARATOR.length;
		if (availableWidth < SINGLE_SELECT_SPLIT_PANE_LEFT_MIN_WIDTH + SINGLE_SELECT_SPLIT_PANE_RIGHT_MIN_WIDTH) {
			return null;
		}

		const preferredLeftWidth = Math.floor(availableWidth * 0.42);
		const left = Math.max(
			SINGLE_SELECT_SPLIT_PANE_LEFT_MIN_WIDTH,
			Math.min(preferredLeftWidth, availableWidth - SINGLE_SELECT_SPLIT_PANE_RIGHT_MIN_WIDTH),
		);
		const right = availableWidth - left;

		if (right < SINGLE_SELECT_SPLIT_PANE_RIGHT_MIN_WIDTH) return null;
		return { left, right };
	}

	private buildListLines(width: number, filteredOptions: QuestionOption[], hideDescriptions = false): string[] {
		const lines: string[] = [];
		const count = this.getItemCount(filteredOptions);
		const searchValue = this.searchQuery ? this.theme.fg("text", this.searchQuery) : this.theme.fg("dim", "type to filter");
		lines.push(truncateToWidth(`${this.theme.fg("accent", "Filter:")} ${searchValue}`, width, ""));

		if (this.searchQuery && filteredOptions.length === 0) {
			lines.push(truncateToWidth(this.theme.fg("warning", "No matching options"), width, ""));
		}

		if (count === 0) {
			if (!this.searchQuery) {
				lines.push(truncateToWidth(this.theme.fg("warning", "No options"), width, ""));
			}
			return lines.slice(0, this.maxVisibleRows);
		}

		const maxRows = Math.max(1, this.maxVisibleRows - lines.length);
		const optionRows = renderSingleSelectRows({
			options: filteredOptions,
			selectedIndex: this.selectedIndex,
			width,
			allowFreeform: this.allowFreeform,
			allowComment: this.allowComment,
			commentEnabled: this.commentEnabled,
			maxRows,
			hideDescriptions,
		});
		const optionLines = optionRows.map((row) => this.styleListLine(row.line, width, row.selected));

		lines.push(...optionLines);
		return lines.slice(0, this.maxVisibleRows);
	}

	private buildPreviewLines(width: number, filteredOptions: QuestionOption[], maxLines: number): string[] {
		if (maxLines <= 0) return [];

		let mdTheme: MarkdownTheme | undefined;
		try {
			mdTheme = getMarkdownTheme();
		} catch { }

		let md = "";

		if (this.isCommentToggleRow(this.selectedIndex, filteredOptions)) {
			md += "## Additional context\n\n";
			md += `Currently: **${this.commentEnabled ? "Enabled" : "Disabled"}**\n\n`;
			md += "Turn this on when the selected option needs extra explanation before the tool submits.\n";
		} else if (this.isFreeformRow(this.selectedIndex, filteredOptions)) {
			md += "## Custom response\n\n";
			md += "Open the editor to write **any** answer.\n\n";
			md += "*Use this when none of the listed options fit.*\n";
			if (this.searchQuery) {
				md += `\n> Current filter: \`${this.searchQuery}\`\n`;
			}
		} else {
			const selected = filteredOptions[this.selectedIndex];
			if (!selected) {
				md += "*No option selected*\n";
			} else {
				md += `## ${selected.title}\n\n`;
				if (selected.description?.trim()) {
					md += `${selected.description}\n`;
				} else {
					md += "*No additional details provided for this option.*\n";
				}
				md += `\n---\n\nPress \`Enter\` to select this option.\n`;
				if (this.searchQuery) {
					md += `\n> Filter: \`${this.searchQuery}\`\n`;
				}
			}
		}

		let lines: string[];
		if (mdTheme) {
			const mdComponent = new Markdown(md.trim(), 0, 0, mdTheme);
			lines = mdComponent.render(width);
		} else {
			lines = [];
			for (const line of wrapTextWithAnsi(md.trim(), Math.max(10, width))) {
				lines.push(truncateToWidth(line, width, ""));
			}
		}

		while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
			lines.pop();
		}

		if (lines.length <= maxLines) return lines;
		if (maxLines === 1) return [truncateToWidth(this.theme.fg("dim", "…"), width, "")];

		const visibleLines = lines.slice(0, maxLines - 1);
		visibleLines.push(truncateToWidth(this.theme.fg("dim", "…"), width, ""));
		return visibleLines;
	}

	handleInput(data: string): void {
		if (this.searchQuery && matchesKey(data, Key.escape)) {
			this.setSearchQuery("");
			return;
		}

		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.onCancel?.();
			return;
		}

		if (this.allowComment && isCommentToggleKey(data)) {
			this.toggleComment();
			return;
		}

		const filteredOptions = this.getFilteredOptions();
		const count = this.getItemCount(filteredOptions);

		if ((this.keybindings.matches(data, "tui.select.up") || matchesKey(data, Key.shift("tab"))) && count > 0) {
			this.selectedIndex = this.selectedIndex === 0 ? count - 1 : this.selectedIndex - 1;
			this.invalidate();
			return;
		}

		if ((this.keybindings.matches(data, "tui.select.down") || matchesKey(data, Key.tab)) && count > 0) {
			this.selectedIndex = this.selectedIndex === count - 1 ? 0 : this.selectedIndex + 1;
			this.invalidate();
			return;
		}

		const numMatch = data.match(/^[1-9]$/);
		if (numMatch && filteredOptions.length > 0) {
			const idx = Number.parseInt(numMatch[0], 10) - 1;
			if (idx >= 0 && idx < filteredOptions.length) {
				this.selectedIndex = idx;
				this.invalidate();
				return;
			}
		}

		if (matchesKey(data, Key.space) && count > 0 && this.isCommentToggleRow(this.selectedIndex, filteredOptions)) {
			this.toggleComment();
			return;
		}

		if (this.keybindings.matches(data, "tui.select.confirm") && count > 0) {
			if (this.isCommentToggleRow(this.selectedIndex, filteredOptions)) {
				this.toggleComment();
				return;
			}
			if (this.isFreeformRow(this.selectedIndex, filteredOptions)) {
				this.onEnterFreeform?.();
				return;
			}

			const result = filteredOptions[this.selectedIndex]?.title;
			if (result) this.onSubmit?.(result);
			else this.onCancel?.();
			return;
		}

		if (this.keybindings.matches(data, "tui.editor.deleteCharBackward") || matchesKey(data, Key.backspace)) {
			this.popSearchCharacter();
			return;
		}

		const printableInput = this.getPrintableInput(data);
		if (printableInput) {
			this.setSearchQuery(this.searchQuery + printableInput);
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const filteredOptions = this.getFilteredOptions();
		const count = this.getItemCount(filteredOptions);
		this.selectedIndex = count > 0 ? Math.max(0, Math.min(this.selectedIndex, count - 1)) : 0;

		const splitPane = this.getSplitPaneWidths(width);
		let lines: string[];

		if (!splitPane) {
			lines = this.buildListLines(width, filteredOptions);
		} else {
			const listLines = this.buildListLines(splitPane.left, filteredOptions, true);
			const previewLines = this.buildPreviewLines(splitPane.right, filteredOptions, this.maxVisibleRows);
			const rowCount = Math.min(this.maxVisibleRows, Math.max(listLines.length, previewLines.length));
			const separator = this.theme.fg("dim", SINGLE_SELECT_SPLIT_PANE_SEPARATOR);
			lines = Array.from({ length: rowCount }, (_, index) => {
				const left = truncateToWidth(listLines[index] ?? "", splitPane.left, "", true);
				const right = truncateToWidth(previewLines[index] ?? "", splitPane.right, "");
				return `${left}${separator}${right}`;
			});
		}

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}

/**
 * Interactive ask UI. Uses a root Container for layout and swaps the center
 * component between SelectList/MultiSelectList and an Editor (freeform mode).
 */
export class AskComponent extends Container {
	private question: string;
	private context?: string;
	private options: QuestionOption[];
	private allowMultiple: boolean;
	private allowFreeform: boolean;
	private allowComment: boolean;
	private tui: TUI;
	private theme: Theme;
	private keybindings: KeybindingsManager;
	private onDone: (result: AskUIResult | null) => void;

	private mode: AskMode = "select";
	private pendingSelections: string[] = [];
	private freeformDraft = "";
	private commentDraft = "";

	// Static layout components
	private titleText: Text;
	private questionText: Text;
	private contextComponent?: Component;
	private modeContainer: Container;
	private helpText: Text;

	// Mode components
	private singleSelectList?: WrappedSingleSelectList;
	private multiSelectList?: MultiSelectList;
	private editor?: Editor;

	// Focusable - propagate to Editor for IME cursor positioning
	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		if (this.editor && (this.mode === "freeform" || this.mode === "comment")) {
			(this.editor as any).focused = value;
		}
	}

	constructor(
		question: string,
		context: string | undefined,
		options: QuestionOption[],
		allowMultiple: boolean,
		allowFreeform: boolean,
		allowComment: boolean,
		tui: TUI,
		theme: Theme,
		keybindings: KeybindingsManager,
		onDone: (result: AskUIResult | null) => void,
	) {
		super();

		this.question = question;
		this.context = context;
		this.options = options;
		this.allowMultiple = allowMultiple;
		this.allowFreeform = allowFreeform;
		this.allowComment = allowComment;
		this.tui = tui;
		this.theme = theme;
		this.keybindings = keybindings;
		this.onDone = onDone;

		// Layout skeleton
		this.addChild(new BoxBorderTop(
			(s: string) => theme.fg("accent", s),
			"ask_user",
			(s: string) => theme.fg("dim", theme.bold(s)),
		));
		this.addChild(new Spacer(1));

		this.titleText = new Text("", 1, 0);
		this.addChild(this.titleText);
		this.addChild(new Spacer(1));

		this.questionText = new Text("", 1, 0);
		this.addChild(this.questionText);

		if (this.context) {
			this.addChild(new Spacer(1));
			let mdTheme: MarkdownTheme | undefined;
			try {
				mdTheme = getMarkdownTheme();
			} catch { }
			if (mdTheme) {
				this.contextComponent = new Markdown("", 1, 0, mdTheme);
			} else {
				this.contextComponent = new Text("", 1, 0);
			}
			this.addChild(this.contextComponent);
		}

		this.addChild(new Spacer(1));

		this.modeContainer = new Container();
		this.addChild(this.modeContainer);

		this.addChild(new Spacer(1));
		this.helpText = new Text("", 1, 0);
		this.addChild(this.helpText);

		this.addChild(new Spacer(1));
		this.addChild(new BoxBorderBottom(
			(s: string) => theme.fg("accent", s),
			"ask_user",
			(s: string) => theme.fg("dim", s),
		));

		this.updateStaticText();
		this.showSelectMode();
	}

	override invalidate(): void {
		super.invalidate();
		this.updateStaticText();
		this.updateHelpText();
	}

	override render(width: number): string[] {
		const innerWidth = Math.max(1, width - BOX_BORDER_OVERHEAD);

		if (this.mode === "select" && !this.allowMultiple) {
			const overlayMaxHeight = Math.max(12, Math.floor(this.tui.terminal.rows * ASK_OVERLAY_MAX_HEIGHT_RATIO));
			const staticLines = this.countStaticLines(innerWidth);
			const availableOptionRows = Math.max(4, overlayMaxHeight - staticLines);
			this.ensureSingleSelectList().setMaxVisibleRows(availableOptionRows);
		}

		// Render children at the inner width (excluding side border characters)
		const rawLines = super.render(innerWidth);

		// First and last lines are the top/bottom box borders — pass through at full width.
		// All inner lines get wrapped with side borders.
		const borderColor = (s: string) => this.theme.fg("accent", s);
		const titleColor = (s: string) => this.theme.fg("dim", this.theme.bold(s));
		return rawLines.map((line, index) => {
			if (index === 0 || index === rawLines.length - 1) {
				// Box top/bottom borders already rendered at innerWidth — re-render at full width
				if (index === 0) return new BoxBorderTop(borderColor, "ask_user", titleColor).render(width)[0];
				return new BoxBorderBottom(borderColor, "ask_user", (s: string) => this.theme.fg("dim", s)).render(width)[0];
			}
			const padded = truncateToWidth(line, innerWidth, "", true);
			return `${borderColor(BOX_BORDER_LEFT)}${padded}${borderColor(BOX_BORDER_RIGHT)}`;
		});
	}

	private countWrappedLines(text: string, width: number): number {
		return Math.max(1, wrapTextWithAnsi(text, Math.max(10, width - 2)).length);
	}

	private countStaticLines(width: number): number {
		const titleLines = 1;
		const questionLines = this.countWrappedLines(this.question, width);
		const contextLines = this.context ? 1 + this.countWrappedLines(this.context, width) : 0;
		const helpLines = 1;
		const borderLines = 2;
		const spacerLines = this.context ? 6 : 5;
		return borderLines + spacerLines + titleLines + questionLines + contextLines + helpLines;
	}

	private updateStaticText(): void {
		const theme = this.theme;
		const title = this.mode === "comment" ? "Optional comment" : "Question";
		this.titleText.setText(theme.fg("accent", theme.bold(title)));
		this.questionText.setText(theme.fg("text", theme.bold(this.question)));
		if (this.contextComponent && this.context) {
			if (this.contextComponent instanceof Markdown) {
				(this.contextComponent as Markdown).setText(
					`**Context:**\n${this.context}`,
				);
			} else {
				(this.contextComponent as Text).setText(
					`${theme.fg("accent", theme.bold("Context:"))}\n${theme.fg("dim", this.context)}`,
				);
			}
		}
	}

	private updateHelpText(): void {
		const theme = this.theme;
		if (this.mode === "freeform" || this.mode === "comment") {
			const alternateCancelKeys = this.keybindings
				.getKeys("tui.select.cancel")
				.filter((key) => key !== "escape" && key !== "esc");
			const hints = [
				keybindingHint(theme, this.keybindings, "tui.input.submit", this.mode === "comment" ? "submit/skip" : "submit"),
				keybindingHint(theme, this.keybindings, "tui.input.newLine", "newline"),
				literalHint(theme, "esc", "back"),
				alternateCancelKeys.length > 0 ? literalHint(theme, formatKeyList(alternateCancelKeys), "cancel") : null,
			]
				.filter((hint): hint is string => !!hint)
				.join(" • ");
			this.helpText.setText(theme.fg("dim", hints));
			return;
		}

		if (this.allowMultiple) {
			const hints = [
				literalHint(theme, "↑↓", "navigate"),
				literalHint(theme, "space", "toggle"),
				this.allowComment ? literalHint(theme, "ctrl+g", "toggle context") : null,
				keybindingHint(theme, this.keybindings, "tui.select.confirm", "submit"),
				keybindingHint(theme, this.keybindings, "tui.select.cancel", "cancel"),
			]
				.filter((hint): hint is string => !!hint)
				.join(" • ");
			this.helpText.setText(theme.fg("dim", hints));
		} else {
			const alternateCancelKeys = this.keybindings
				.getKeys("tui.select.cancel")
				.filter((key) => key !== "escape" && key !== "esc");
			const hints = [
				literalHint(theme, "type", "filter"),
				keybindingHint(theme, this.keybindings, "tui.editor.deleteCharBackward", "erase"),
				literalHint(theme, "↑↓", "navigate"),
				this.allowComment ? literalHint(theme, "ctrl+g", "toggle context") : null,
				keybindingHint(theme, this.keybindings, "tui.select.confirm", "select"),
				literalHint(theme, "esc", "clear/cancel"),
				alternateCancelKeys.length > 0
					? literalHint(theme, formatKeyList(alternateCancelKeys), "cancel")
					: null,
			]
				.filter((hint): hint is string => !!hint)
				.join(" • ");
			this.helpText.setText(theme.fg("dim", hints));
		}
	}

	private ensureSingleSelectList(): WrappedSingleSelectList {
		if (this.singleSelectList) return this.singleSelectList;

		const list = new WrappedSingleSelectList(
			this.options,
			this.allowFreeform,
			this.allowComment,
			this.theme,
			this.keybindings,
		);
		list.onSubmit = (result) => this.handleSelectionSubmit([result], list.isCommentEnabled());
		list.onCancel = () => this.onDone(null);
		list.onEnterFreeform = () => this.showFreeformMode();

		this.singleSelectList = list;
		return list;
	}

	private ensureMultiSelectList(): MultiSelectList {
		if (this.multiSelectList) return this.multiSelectList;

		const list = new MultiSelectList(
			this.options,
			this.allowFreeform,
			this.allowComment,
			this.theme,
			this.keybindings,
		);
		list.onCancel = () => this.onDone(null);
		list.onSubmit = (result) => this.handleSelectionSubmit(result, list.isCommentEnabled());
		list.onEnterFreeform = () => this.showFreeformMode();

		this.multiSelectList = list;
		return list;
	}

	private ensureEditor(): Editor {
		if (this.editor) return this.editor;
		const editor = new Editor(this.tui, createEditorTheme(this.theme));
		editor.disableSubmit = false;
		editor.onSubmit = (text: string) => {
			this.handleEditorSubmit(text);
		};
		this.editor = editor;
		return editor;
	}

	private saveEditorDraft(): void {
		if (!this.editor) return;
		const getText = (this.editor as any).getText;
		if (typeof getText !== "function") return;

		const currentText = String(getText.call(this.editor) ?? "");
		if (this.mode === "freeform") {
			this.freeformDraft = currentText;
		} else if (this.mode === "comment") {
			this.commentDraft = currentText;
		}
	}

	private setEditorText(text: string): void {
		const editor = this.ensureEditor();
		const setText = (editor as any).setText;
		if (typeof setText === "function") {
			setText.call(editor, text);
		}
	}

	private handleSelectionSubmit(selections: string[], wantsComment: boolean): void {
		if (this.allowComment && wantsComment) {
			this.pendingSelections = selections;
			this.commentDraft = "";
			this.showCommentMode();
			return;
		}

		this.onDone(createSelectionResponse(selections));
	}

	private handleEditorSubmit(text: string): void {
		if (this.mode === "freeform") {
			this.onDone(createFreeformResponse(text));
			return;
		}

		if (this.mode === "comment") {
			this.commentDraft = text;
			this.onDone(createSelectionResponse(this.pendingSelections, text));
		}
	}

	private showSelectMode(): void {
		if (this.mode === "freeform" || this.mode === "comment") {
			this.saveEditorDraft();
		}

		this.mode = "select";
		this.pendingSelections = [];
		this.modeContainer.clear();

		if (this.allowMultiple) {
			this.modeContainer.addChild(this.ensureMultiSelectList());
		} else {
			this.modeContainer.addChild(this.ensureSingleSelectList());
		}

		this.updateHelpText();
		this.invalidate();
		this.tui.requestRender();
	}

	private showFreeformMode(): void {
		if (this.mode === "comment") {
			this.saveEditorDraft();
		}

		this.mode = "freeform";
		this.modeContainer.clear();

		const editor = this.ensureEditor();
		this.setEditorText(this.freeformDraft);
		(editor as any).focused = this._focused;

		this.modeContainer.addChild(new Text(this.theme.fg("accent", this.theme.bold("Custom response")), 1, 0));
		this.modeContainer.addChild(new Spacer(1));
		this.modeContainer.addChild(editor);

		this.updateHelpText();
		this.invalidate();
		this.tui.requestRender();
	}

	private showCommentMode(): void {
		if (this.mode === "freeform") {
			this.saveEditorDraft();
		}

		this.mode = "comment";
		this.modeContainer.clear();

		const editor = this.ensureEditor();
		this.setEditorText(this.commentDraft);
		(editor as any).focused = this._focused;

		const selectedLabel = this.pendingSelections.length === 1 ? "Selected option:" : "Selected options:";
		this.modeContainer.addChild(new Text(this.theme.fg("accent", this.theme.bold(selectedLabel)), 1, 0));
		this.modeContainer.addChild(new Text(this.theme.fg("text", this.pendingSelections.join(", ")), 1, 0));
		this.modeContainer.addChild(new Spacer(1));
		this.modeContainer.addChild(editor);

		this.updateHelpText();
		this.invalidate();
		this.tui.requestRender();
	}

	handleInput(data: string): void {
		if (this.mode === "freeform" || this.mode === "comment") {
			if (matchesKey(data, Key.escape)) {
				this.showSelectMode();
				return;
			}

			if (this.keybindings.matches(data, "tui.select.cancel")) {
				this.onDone(null);
				return;
			}

			this.ensureEditor().handleInput(data);
			this.tui.requestRender();
			return;
		}

		if (this.allowMultiple) {
			this.ensureMultiSelectList().handleInput?.(data);
			this.tui.requestRender();
			return;
		}

		this.ensureSingleSelectList().handleInput?.(data);
		this.tui.requestRender();
	}
}

