export interface QuestionOption {
	title: string;
	description?: string;
}

export type AskOptionInput = QuestionOption | string;
export type AskDisplayMode = "overlay" | "inline";

export interface AskParams {
	question: string;
	context?: string;
	options?: AskOptionInput[];
	allowMultiple?: boolean;
	allowFreeform?: boolean;
	allowComment?: boolean;
	displayMode?: AskDisplayMode;
	timeout?: number;
}

export type AskResponse =
	| { kind: "selection"; selections: string[]; comment?: string }
	| { kind: "freeform"; text: string };

export interface AskToolDetails {
	question: string;
	context?: string;
	options: QuestionOption[];
	response: AskResponse | null;
	cancelled: boolean;
}

export type AskUIResult = AskResponse;
