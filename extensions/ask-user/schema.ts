import { StringEnum, Type } from "@mariozechner/pi-ai";

export const AskUserParamsSchema = Type.Object({
	question: Type.String({ description: "The question to ask the user" }),
	context: Type.Optional(Type.String({ description: "Relevant context to show before the question (summary of findings)" })),
	options: Type.Optional(
		Type.Array(
			Type.Union([
				Type.String({ description: "Short title for this option" }),
				Type.Object({
					title: Type.String({ description: "Short title for this option" }),
					description: Type.Optional(Type.String({ description: "Longer description explaining this option" })),
				}),
			]),
			{ description: "List of options for the user to choose from" },
		),
	),
	allowMultiple: Type.Optional(Type.Boolean({ description: "Allow selecting multiple options. Default: false" })),
	allowFreeform: Type.Optional(Type.Boolean({ description: "Add a freeform text option. Default: true" })),
	allowComment: Type.Optional(Type.Boolean({ description: "Collect an optional comment after selecting one or more options. Default: false" })),
	displayMode: Type.Optional(StringEnum(["overlay", "inline"] as const, {
		description: "UI rendering mode. 'overlay' shows a centered modal, 'inline' renders in-place. Omit to respect piPackage.askUser.displayMode, then PI_ASK_USER_DISPLAY_MODE, then overlay.",
	})),
	timeout: Type.Optional(Type.Number({ description: "Auto-dismiss after N milliseconds. Returns cancelled when expired." })),
});
