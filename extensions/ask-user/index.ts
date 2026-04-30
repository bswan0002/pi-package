import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { Text, type KeybindingsManager, type TUI } from "@mariozechner/pi-tui";
import { loadPiPackageConfig } from "../shared/config";
import { EVENTS } from "../shared/events";
import { askViaDialogs } from "./fallback";
import { createFreeformResponse, formatOptionsForMessage, formatResponseSummary, isSelectionResponse, normalizeOptions } from "./format";
import { AskUserParamsSchema } from "./schema";
import { AskComponent, buildCustomUIOptions } from "./ui";
import type { AskDisplayMode, AskParams, AskResponse, AskToolDetails, AskUIResult, QuestionOption } from "./types";

function effectiveDisplayMode(paramMode: AskDisplayMode | undefined): AskDisplayMode {
	if (paramMode) return paramMode;
	const configured = loadPiPackageConfig().askUser?.displayMode;
	if (configured === "overlay" || configured === "inline") return configured;
	const envMode = process.env.PI_ASK_USER_DISPLAY_MODE;
	if (envMode === "overlay" || envMode === "inline") return envMode;
	return "overlay";
}

function cancelledDetails(question: string, context: string | undefined, options: QuestionOption[]): AskToolDetails {
	return { question, context, options, response: null, cancelled: true };
}

async function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T | undefined> {
	if (!signal) return promise;
	if (signal.aborted) return undefined;
	return new Promise<T | undefined>((resolve, reject) => {
		const onAbort = () => resolve(undefined);
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", onAbort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
	});
}

async function withoutWorkingSpinner<T>(ui: unknown, task: () => Promise<T>): Promise<T> {
	const setWorkingVisible = (ui as { setWorkingVisible?: (visible: boolean) => void })?.setWorkingVisible;
	setWorkingVisible?.(false);
	try {
		return await task();
	} finally {
		setWorkingVisible?.(true);
	}
}

export default function(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user",
		label: "Ask User",
		description: "Ask the user a focused question with optional multiple-choice answers. Use ask_user to gather explicit input interactively after collecting relevant context.",
		promptSnippet: "Ask the user one focused question with optional multiple-choice answers to gather information interactively",
		promptGuidelines: [
			"Before calling ask_user, gather context with tools (read/web/ref) and pass a short summary via the context field.",
			"Use ask_user when the user's intent is ambiguous, when a decision requires explicit user input, or when multiple valid options exist.",
			"Ask exactly one focused question per ask_user call.",
			"Do not combine multiple numbered, multipart, or unrelated questions into one ask_user prompt.",
		],
		parameters: AskUserParamsSchema,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const {
				question,
				context,
				options: rawOptions = [],
				allowMultiple = false,
				allowFreeform = true,
				allowComment = false,
				displayMode,
				timeout,
			} = params as AskParams;
			const options = normalizeOptions(rawOptions);
			const normalizedContext = context?.trim() || undefined;
			const basePayload = { toolCallId, question, context: normalizedContext, options };

			if (signal?.aborted) {
				return { content: [{ type: "text", text: "User cancelled the question" }], details: cancelledDetails(question, normalizedContext, options) };
			}

			if (!ctx.hasUI || !ctx.ui) {
				const optionText = options.length > 0 ? `\n\nOptions:\n${formatOptionsForMessage(options)}` : "";
				const freeformHint = allowFreeform ? "\n\nYou can also answer freely." : "";
				const commentHint = allowComment ? "\n\nAfter choosing an option, you may add an optional comment." : "";
				const contextText = normalizedContext ? `\n\nContext:\n${normalizedContext}` : "";
				return {
					content: [{ type: "text", text: `Ask requires interactive mode. Please answer:\n\n${question}${contextText}${optionText}${freeformHint}${commentHint}` }],
					isError: true,
					details: cancelledDetails(question, normalizedContext, options),
				};
			}

			if (options.length === 0) {
				const prompt = normalizedContext ? `${question}\n\nContext:\n${normalizedContext}` : question;
				const answer = await withoutWorkingSpinner(ctx.ui, () =>
					raceAbort(ctx.ui.input(prompt, "Type your answer...", timeout ? { timeout } : undefined), signal),
				);
				const response = createFreeformResponse(answer);
				if (!response) {
					pi.events.emit(EVENTS.ASK_USER_CANCELLED, basePayload);
					return { content: [{ type: "text", text: "User cancelled the question" }], details: cancelledDetails(question, normalizedContext, options) };
				}
				pi.events.emit(EVENTS.ASK_USER_ANSWERED, { ...basePayload, response });
				return { content: [{ type: "text", text: `User answered: ${formatResponseSummary(response)}` }], details: { question, context: normalizedContext, options, response, cancelled: false } as AskToolDetails };
			}

			onUpdate?.({ content: [{ type: "text", text: "Waiting for user input..." }], details: { question, context: normalizedContext, options, response: null, cancelled: false } });

			let result: AskUIResult | null;
			try {
				result = await withoutWorkingSpinner(ctx.ui, async () => {
					const customFactory = (tui: TUI, theme: Theme, keybindings: KeybindingsManager, done: (result: AskUIResult | null) => void) => {
						let settled = false;
						let timeoutHandle: NodeJS.Timeout | undefined;
						const cleanup = () => {
							if (timeoutHandle) clearTimeout(timeoutHandle);
							if (signal) signal.removeEventListener("abort", onAbort);
						};
						const settle = (value: AskUIResult | null) => {
							if (settled) return;
							settled = true;
							cleanup();
							done(value);
						};
						const onAbort = () => settle(null);
						if (signal) signal.addEventListener("abort", onAbort, { once: true });
						if (timeout && timeout > 0) timeoutHandle = setTimeout(() => settle(null), timeout);
						return new AskComponent(question, normalizedContext, options, allowMultiple, allowFreeform, allowComment, tui, theme, keybindings, settle);
					};
					const customResult = await ctx.ui.custom<AskUIResult | null>(customFactory, buildCustomUIOptions(effectiveDisplayMode(displayMode)));
					return customResult !== undefined
						? customResult
						: await askViaDialogs(ctx.ui, question, normalizedContext, options, allowMultiple, allowFreeform, allowComment, timeout);
				});
			} catch (error) {
				const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
				return { content: [{ type: "text", text: `Ask tool failed: ${message}` }], isError: true, details: { ...cancelledDetails(question, normalizedContext, options), error: message } };
			}

			if (result === null) {
				pi.events.emit(EVENTS.ASK_USER_CANCELLED, basePayload);
				return { content: [{ type: "text", text: "User cancelled the question" }], details: cancelledDetails(question, normalizedContext, options) };
			}
			pi.events.emit(EVENTS.ASK_USER_ANSWERED, { ...basePayload, response: result });
			return { content: [{ type: "text", text: `User answered: ${formatResponseSummary(result)}` }], details: { question, context: normalizedContext, options, response: result, cancelled: false } as AskToolDetails };
		},

		renderCall(args, theme) {
			const question = (args.question as string) || "";
			const rawOptions = Array.isArray(args.options) ? args.options : [];
			let text = theme.fg("toolTitle", theme.bold("ask_user ")) + theme.fg("muted", question);
			if (rawOptions.length > 0) {
				const labels = rawOptions.map((o: unknown) => typeof o === "string" ? o : (o as QuestionOption)?.title ?? "");
				text += "\n" + theme.fg("dim", `  ${rawOptions.length} option(s): ${labels.join(", ")}`);
			}
			if (args.allowMultiple) text += theme.fg("dim", " [multi-select]");
			if (args.allowComment) text += theme.fg("dim", " [optional comment]");
			return new Text(text, 0, 0);
		},

		renderResult(result, options, theme) {
			const details = result.details as (AskToolDetails & { error?: string }) | undefined;
			if (details?.error) return new Text(theme.fg("error", `✗ ${details.error}`), 0, 0);
			if (options.isPartial) {
				const waitingText = result.content?.filter((part: any) => part?.type === "text").map((part: any) => part.text ?? "").join("\n").trim() || "Waiting for user input...";
				return new Text(theme.fg("muted", waitingText), 0, 0);
			}
			if (!details || details.cancelled || !details.response) return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			const response = details.response as AskResponse;
			let text = theme.fg("success", "✓ ");
			if (response.kind === "freeform") text += theme.fg("muted", "(wrote) ");
			text += theme.fg("accent", formatResponseSummary(response));
			if (options.expanded) {
				text += "\n" + theme.fg("dim", `Q: ${details.question}`);
				if (details.context) text += "\n" + theme.fg("dim", details.context);
				if (isSelectionResponse(response) && details.options.length > 0) {
					const selectedTitles = new Set(response.selections);
					text += "\n" + theme.fg("dim", "Options:");
					for (const opt of details.options) {
						const desc = opt.description ? ` — ${opt.description}` : "";
						const marker = selectedTitles.has(opt.title) ? theme.fg("success", "●") : theme.fg("dim", "○");
						text += `\n  ${marker} ${theme.fg("dim", opt.title)}${theme.fg("dim", desc)}`;
					}
					if (response.comment) text += `\n${theme.fg("dim", "Comment:")} ${theme.fg("dim", response.comment)}`;
				}
			}
			return new Text(text, 0, 0);
		},
	});
}
