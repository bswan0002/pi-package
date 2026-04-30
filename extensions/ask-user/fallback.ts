import { buildCommentPrompt, createFreeformResponse, createSelectionResponse, formatOptionsForMessage, isCancelledInput, parseDialogSelections } from "./format";
import { FREEFORM_SENTINEL } from "./ui";
import type { AskUIResult, QuestionOption } from "./types";

export async function askViaDialogs(
	ui: { select: Function; input: Function },
	question: string,
	context: string | undefined,
	options: QuestionOption[],
	allowMultiple: boolean,
	allowFreeform: boolean,
	allowComment: boolean,
	timeout?: number,
): Promise<AskUIResult | null> {
	const dialogOpts = timeout ? { timeout } : undefined;
	const prompt = context ? `${question}\n\nContext:\n${context}` : question;

	if (allowMultiple) {
		const optionList = formatOptionsForMessage(options);
		const rawSelections = await ui.input(`${prompt}\n\nOptions (select one or more):\n${optionList}`, "Type your selection(s)...", dialogOpts) as string | undefined;
		if (isCancelledInput(rawSelections)) return null;
		const selections = parseDialogSelections(rawSelections);
		if (selections.length === 0) return null;
		if (!allowComment) return createSelectionResponse(selections);
		const comment = await ui.input(buildCommentPrompt(prompt, selections), "Optional comment (press Enter to skip)...", dialogOpts) as string | undefined;
		return createSelectionResponse(selections, comment);
	}

	const selectOptions = options.map((o) => o.title);
	if (allowFreeform) selectOptions.push(FREEFORM_SENTINEL);
	const selected = await ui.select(prompt, selectOptions, dialogOpts) as string | undefined;
	if (isCancelledInput(selected)) return null;
	if (selected === FREEFORM_SENTINEL) {
		const answer = await ui.input(prompt, "Type your answer...", dialogOpts) as string | undefined;
		if (isCancelledInput(answer)) return null;
		return createFreeformResponse(answer);
	}
	if (!allowComment) return createSelectionResponse([selected]);
	const comment = await ui.input(buildCommentPrompt(prompt, [selected]), "Optional comment (press Enter to skip)...", dialogOpts) as string | undefined;
	return createSelectionResponse([selected], comment);
}
