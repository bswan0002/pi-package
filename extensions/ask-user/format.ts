import type { AskOptionInput, AskResponse, QuestionOption } from "./types";

export function normalizeOptions(options: AskOptionInput[]): QuestionOption[] {
	return options
		.map((option) => {
			if (typeof option === "string") return { title: option };
			if (option && typeof option === "object" && typeof option.title === "string") {
				return { title: option.title, description: option.description };
			}
			return null;
		})
		.filter((option): option is QuestionOption => option !== null);
}

export function formatOptionsForMessage(options: QuestionOption[]): string {
	return options
		.map((option, index) => {
			const desc = option.description ? ` — ${option.description}` : "";
			return `${index + 1}. ${option.title}${desc}`;
		})
		.join("\n");
}

export function normalizeOptionalComment(text: string | null | undefined): string | undefined {
	const trimmed = text?.trim();
	return trimmed ? trimmed : undefined;
}

export function createFreeformResponse(text: string | null | undefined): AskResponse | null {
	const trimmed = text?.trim();
	return trimmed ? { kind: "freeform", text: trimmed } : null;
}

export function createSelectionResponse(selections: string[], comment?: string | null): AskResponse | null {
	const normalizedSelections = selections.map((selection) => selection.trim()).filter(Boolean);
	if (normalizedSelections.length === 0) return null;

	const normalizedComment = normalizeOptionalComment(comment);
	return normalizedComment
		? { kind: "selection", selections: normalizedSelections, comment: normalizedComment }
		: { kind: "selection", selections: normalizedSelections };
}

export function formatResponseSummary(response: AskResponse): string {
	if (response.kind === "freeform") return response.text;
	const selections = response.selections.join(", ");
	return response.comment ? `${selections} — ${response.comment}` : selections;
}

export function buildCommentPrompt(prompt: string, selections: string[]): string {
	const label = selections.length === 1 ? "Selected option" : "Selected options";
	const lines = selections.map((selection) => `- ${selection}`).join("\n");
	return `${prompt}\n\n${label}:\n${lines}`;
}

export function parseDialogSelections(input: string): string[] {
	return input.split(",").map((selection) => selection.trim()).filter(Boolean);
}

export function isCancelledInput(value: unknown): value is null | undefined {
	return value === null || value === undefined;
}

export function isSelectionResponse(response: AskResponse): response is Extract<AskResponse, { kind: "selection" }> {
	return response.kind === "selection";
}
