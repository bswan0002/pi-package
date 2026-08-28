import { StringEnum, Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_RESULT_COUNT = 5;
const MAX_RESULT_COUNT = 20;

const Country = StringEnum([
	"ALL",
	"AR",
	"AU",
	"AT",
	"BE",
	"BR",
	"CA",
	"CL",
	"DK",
	"FI",
	"FR",
	"DE",
	"HK",
	"IN",
	"ID",
	"IT",
	"JP",
	"KR",
	"MY",
	"MX",
	"NL",
	"NZ",
	"NO",
	"CN",
	"PL",
	"PT",
	"PH",
	"RU",
	"SA",
	"ZA",
	"ES",
	"SE",
	"CH",
	"TW",
	"TR",
	"GB",
	"US",
] as const);

const SafeSearch = StringEnum(["off", "moderate", "strict"] as const);
const Freshness = StringEnum(["pd", "pw", "pm", "py"] as const);

const BraveSearchParams = Type.Object({
	query: Type.String({ description: "Search query" }),
	count: Type.Optional(Type.Number({ description: `Number of results to return. Default ${DEFAULT_RESULT_COUNT}, max ${MAX_RESULT_COUNT}.` })),
	offset: Type.Optional(Type.Number({ description: "Zero-based result offset for pagination. Default 0." })),
	country: Type.Optional(Country),
	searchLang: Type.Optional(Type.String({ description: "Search language code, e.g. en, es, fr. Default: Brave API default." })),
	safeSearch: Type.Optional(SafeSearch),
	freshness: Type.Optional(Freshness),
});

type BraveWebResult = {
	title?: string;
	url?: string;
	description?: string;
	age?: string;
	language?: string;
	profile?: {
		name?: string;
		url?: string;
	};
};

type BraveSearchResponse = {
	query?: {
		original?: string;
		altered?: string;
	};
	web?: {
		results?: BraveWebResult[];
	};
};

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
	if (!Number.isFinite(value)) return fallback;
	return Math.max(min, Math.min(max, Math.floor(value ?? fallback)));
}

function resultToText(result: BraveWebResult, index: number) {
	const title = result.title?.trim() || "Untitled";
	const url = result.url?.trim() || result.profile?.url?.trim() || "No URL";
	const description = result.description?.trim();
	const metadata = [result.age, result.language].filter(Boolean).join(" · ");

	return [
		`${index + 1}. ${title}`,
		url,
		description,
		metadata ? `(${metadata})` : undefined,
	]
		.filter(Boolean)
		.join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "brave_search",
		label: "Brave Search",
		description: "Search the web using the Brave Search API. Requires BRAVE_SEARCH_API_KEY in the environment.",
		promptSnippet: "Search the web using Brave Search API",
		promptGuidelines: [
			"Use brave_search when the user asks for current web information, documentation, facts, or search results.",
			"Use brave_search results as citations: include source URLs when answering from web search results.",
		],
		parameters: BraveSearchParams,

		async execute(_toolCallId, params, signal) {
			const apiKey = process.env.BRAVE_SEARCH_API_KEY;
			if (!apiKey) {
				throw new Error("Missing BRAVE_SEARCH_API_KEY environment variable.");
			}

			const query = params.query.trim();
			if (!query) throw new Error("Search query cannot be empty.");

			const count = clampInteger(params.count, DEFAULT_RESULT_COUNT, 1, MAX_RESULT_COUNT);
			const offset = clampInteger(params.offset, 0, 0, 9_999);

			const url = new URL(BRAVE_SEARCH_ENDPOINT);
			url.searchParams.set("q", query);
			url.searchParams.set("count", String(count));
			if (offset > 0) url.searchParams.set("offset", String(offset));
			if (params.country && params.country !== "ALL") url.searchParams.set("country", params.country);
			if (params.searchLang) url.searchParams.set("search_lang", params.searchLang);
			if (params.safeSearch) url.searchParams.set("safesearch", params.safeSearch);
			if (params.freshness) url.searchParams.set("freshness", params.freshness);

			const response = await fetch(url, {
				signal,
				headers: {
					Accept: "application/json",
					"X-Subscription-Token": apiKey,
				},
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => "");
				throw new Error(`Brave Search API failed: ${response.status} ${response.statusText}${errorText ? `\n${errorText.slice(0, 1000)}` : ""}`);
			}

			const data = (await response.json()) as BraveSearchResponse;
			const results = data.web?.results ?? [];

			let text = results.length === 0 ? "No Brave Search results found." : results.map(resultToText).join("\n\n");
			if (data.query?.altered && data.query.altered !== data.query.original) {
				text = `Brave searched for: ${data.query.altered}\n\n${text}`;
			}

			return {
				content: [{ type: "text", text }],
				details: {
					query,
					count,
					offset,
					results,
				},
			};
		},
	});
}
