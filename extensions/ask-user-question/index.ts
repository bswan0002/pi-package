/**
 * rpiv-ask-user-question — Pi extension. Registers the `ask_user_question`
 * tool: a structured option selector with a free-text "Other" fallback.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerAskUserQuestionTool } from "./ask-user-question";

export default function (pi: ExtensionAPI) {
	registerAskUserQuestionTool(pi);
}
