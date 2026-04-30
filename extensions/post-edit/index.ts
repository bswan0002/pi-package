import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { isEditToolResult, isWriteToolResult, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { EVENTS as SHARED_EVENTS } from "../shared/events";

const CONFIG_PATH = ".pi/post-edit.json";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 120_000;

export const EVENTS = {
	STARTED: SHARED_EVENTS.POST_EDIT_STARTED,
	JOB_STARTED: SHARED_EVENTS.POST_EDIT_JOB_STARTED,
	JOB_FINISHED: SHARED_EVENTS.POST_EDIT_JOB_FINISHED,
	RETRY: SHARED_EVENTS.POST_EDIT_RETRY,
	FAILED: SHARED_EVENTS.POST_EDIT_FAILED,
	COMPLETED: SHARED_EVENTS.POST_EDIT_COMPLETED,
} as const;

type JobMode = "files" | "project";

type PostEditJob = {
	name: string;
	files?: string[];
	command: string;
	args?: string[];
	mode?: JobMode;
	timeoutMs?: number;
	runIfNoFiles?: boolean;
};

type PostEditConfig = {
	enabled?: boolean;
	maxRetries?: number;
	ignore?: string[];
	jobs?: PostEditJob[];
};

type GitStatusMap = Map<string, string>;

type JobRunResult = {
	job: PostEditJob;
	matchedFiles: string[];
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
	skipped: boolean;
};

const DEFAULT_IGNORES = [
	".git/**",
	"node_modules/**",
	"dist/**",
	"build/**",
	"coverage/**",
	".next/**",
	".nuxt/**",
	".svelte-kit/**",
	".turbo/**",
	".vite/**",
];

function normalizeRelativePath(filePath: string, cwd: string) {
	const relative = path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
	return relative.replace(/\\/g, "/").replace(/^\.\//, "");
}

function escapeRegExp(value: string) {
	return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function expandBraces(pattern: string): string[] {
	const match = /\{([^{}]+)\}/.exec(pattern);
	if (!match) return [pattern];

	const [whole, inner] = match;
	return inner
		.split(",")
		.flatMap((part) => expandBraces(pattern.replace(whole, part.trim())));
}

function globToRegExp(pattern: string) {
	let source = "^";
	const normalized = pattern.replace(/\\/g, "/").replace(/^\.\//, "");

	for (let index = 0; index < normalized.length; index++) {
		const char = normalized[index];
		const next = normalized[index + 1];

		if (char === "*" && next === "*") {
			const after = normalized[index + 2];
			if (after === "/") {
				source += "(?:.*/)?";
				index += 2;
			} else {
				source += ".*";
				index++;
			}
			continue;
		}

		if (char === "*") {
			source += "[^/]*";
			continue;
		}

		if (char === "?") {
			source += "[^/]";
			continue;
		}

		source += escapeRegExp(char);
	}

	source += "$";
	return new RegExp(source);
}

function matchesAny(filePath: string, patterns: string[]) {
	return patterns.some((pattern) => expandBraces(pattern).some((expanded) => globToRegExp(expanded).test(filePath)));
}

function uniqueSorted(values: Iterable<string>) {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function parseGitStatus(output: string): GitStatusMap {
	const status = new Map<string, string>();

	for (const line of output.split("\n")) {
		if (!line.trim()) continue;

		const code = line.slice(0, 2);
		const rawPath = line.slice(3).trim();
		const filePath = rawPath.includes(" -> ") ? rawPath.slice(rawPath.lastIndexOf(" -> ") + 4) : rawPath;
		status.set(filePath.replace(/\\/g, "/"), code);
	}

	return status;
}

function diffGitStatus(before: GitStatusMap | undefined, after: GitStatusMap) {
	if (!before) return [...after.keys()];

	const changed = new Set<string>();
	for (const [filePath, code] of after) {
		if (before.get(filePath) !== code) changed.add(filePath);
	}
	for (const filePath of before.keys()) {
		if (!after.has(filePath)) changed.add(filePath);
	}
	return [...changed];
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown) {
	return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function parseConfig(raw: unknown): PostEditConfig | undefined {
	if (!isObject(raw)) return undefined;

	const jobs = Array.isArray(raw.jobs)
		? raw.jobs.flatMap((job): PostEditJob[] => {
				if (!isObject(job)) return [];
				if (typeof job.name !== "string" || typeof job.command !== "string") return [];

				return [
					{
						name: job.name,
						command: job.command,
						args: stringArray(job.args),
						files: stringArray(job.files),
						mode: job.mode === "project" ? "project" : "files",
						timeoutMs: typeof job.timeoutMs === "number" ? job.timeoutMs : undefined,
						runIfNoFiles: job.runIfNoFiles === true,
					},
				];
			})
		: [];

	return {
		enabled: raw.enabled !== false,
		maxRetries: typeof raw.maxRetries === "number" ? Math.max(0, Math.floor(raw.maxRetries)) : DEFAULT_MAX_RETRIES,
		ignore: stringArray(raw.ignore),
		jobs,
	};
}

async function loadConfig(cwd: string) {
	try {
		const configText = await readFile(path.join(cwd, CONFIG_PATH), "utf8");
		return parseConfig(JSON.parse(configText));
	} catch {
		return undefined;
	}
}

async function getGitStatus(pi: ExtensionAPI, cwd: string) {
	const result = await pi.exec("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
		cwd,
		timeout: 10_000,
	});

	if (result.code !== 0) return undefined;
	return parseGitStatus(result.stdout);
}

function filesForJob(job: PostEditJob, changedFiles: string[], ignorePatterns: string[]) {
	const files = job.files?.length ? job.files : ["**/*"];
	return changedFiles.filter((filePath) => !matchesAny(filePath, ignorePatterns) && matchesAny(filePath, files));
}

function expandArgs(args: string[] | undefined, matchedFiles: string[], cwd: string) {
	return (args ?? []).flatMap((arg) => {
		if (arg === "{files}") return matchedFiles;
		return [arg.replaceAll("{cwd}", cwd).replaceAll("{fileCount}", String(matchedFiles.length))];
	});
}

async function runJob(pi: ExtensionAPI, cwd: string, job: PostEditJob, changedFiles: string[], ignorePatterns: string[]): Promise<JobRunResult> {
	const mode = job.mode ?? "files";
	const matchedFiles = filesForJob(job, changedFiles, ignorePatterns);
	const args = expandArgs(job.args, matchedFiles, cwd);
	const needsFiles = mode === "files" || job.args?.includes("{files}");

	if (needsFiles && matchedFiles.length === 0 && !job.runIfNoFiles) {
		return {
			job,
			matchedFiles,
			stdout: "",
			stderr: "",
			code: 0,
			killed: false,
			skipped: true,
		};
	}

	const result = await pi.exec(job.command, args, {
		cwd,
		timeout: job.timeoutMs ?? DEFAULT_TIMEOUT_MS,
	});

	return {
		job,
		matchedFiles,
		stdout: result.stdout,
		stderr: result.stderr,
		code: result.code,
		killed: result.killed,
		skipped: false,
	};
}

function getFailureOutput(result: JobRunResult) {
	return [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n\n");
}

function summarizeFailure(result: JobRunResult) {
	const output = getFailureOutput(result);
	const status = result.killed ? "timed out or was killed" : `failed with exit code ${result.code}`;
	const suffix = output ? `\n\n${output.slice(0, 1500)}` : "";
	return `Post-edit job '${result.job.name}' ${status}.${suffix}`;
}

function buildAgentFailureMessage(result: JobRunResult, attempts: number) {
	const output = getFailureOutput(result);
	const status = result.killed ? "timed out or was killed" : `failed with exit code ${result.code}`;
	const files = result.matchedFiles.length ? `\nMatched files:\n${result.matchedFiles.map((file) => `- ${file}`).join("\n")}` : "";
	const details = output ? `\n\nValidator output:\n\`\`\`\n${output.slice(0, 6000)}\n\`\`\`` : "";

	return `Post-edit validation failed after ${attempts} attempt${attempts === 1 ? "" : "s"}. The job '${result.job.name}' ${status}.${files}${details}\n\nPlease fix the validation errors.`;
}

export default function (pi: ExtensionAPI) {
	let toolTouchedFiles = new Set<string>();
	let startingGitStatus: GitStatusMap | undefined;
	let running = false;
	let fixAttempts = 0;

	pi.on("agent_start", async (_event, ctx) => {
		toolTouchedFiles = new Set<string>();
		startingGitStatus = await getGitStatus(pi, ctx.cwd).catch(() => undefined);
	});

	pi.on("tool_result", (event, ctx) => {
		if (event.isError) return undefined;
		if (!isEditToolResult(event) && !isWriteToolResult(event)) return undefined;

		const filePath = event.input.path;
		if (typeof filePath === "string") {
			toolTouchedFiles.add(normalizeRelativePath(filePath, ctx.cwd));
		}

		return undefined;
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (running) return undefined;

		const config = await loadConfig(ctx.cwd);
		if (!config?.enabled || !config.jobs?.length) return undefined;

		running = true;
		try {
			const ignorePatterns = [...DEFAULT_IGNORES, ...(config.ignore ?? [])];
			const latestGitStatus = await getGitStatus(pi, ctx.cwd).catch(() => undefined);
			const gitTouchedFiles = latestGitStatus ? diffGitStatus(startingGitStatus, latestGitStatus) : [];
			const changedFiles = uniqueSorted([...toolTouchedFiles, ...gitTouchedFiles].map((filePath) => normalizeRelativePath(filePath, ctx.cwd)));

			if (changedFiles.length === 0) return undefined;

			pi.events.emit(EVENTS.STARTED, {
				attempt: fixAttempts,
				changedFiles,
				cwd: ctx.cwd,
			});

			let finalFailure: JobRunResult | undefined;

			for (const job of config.jobs) {
				const matchedFiles = filesForJob(job, changedFiles, ignorePatterns);
				pi.events.emit(EVENTS.JOB_STARTED, {
					attempt: fixAttempts,
					jobName: job.name,
					matchedFiles,
					cwd: ctx.cwd,
				});

				const result = await runJob(pi, ctx.cwd, job, changedFiles, ignorePatterns);
				pi.events.emit(EVENTS.JOB_FINISHED, {
					attempt: fixAttempts,
					jobName: job.name,
					matchedFiles: result.matchedFiles,
					code: result.code,
					killed: result.killed,
					skipped: result.skipped,
					cwd: ctx.cwd,
				});

				if (result.code !== 0 || result.killed) {
					finalFailure = result;
					break;
				}
			}

			if (!finalFailure) {
				fixAttempts = 0;
				pi.events.emit(EVENTS.COMPLETED, {
					attempts: 1,
					cwd: ctx.cwd,
				});
				ctx.ui.notify("Post-edit checks passed.", "info");
				return undefined;
			}

			fixAttempts += 1;
			pi.events.emit(EVENTS.FAILED, {
				attempts: fixAttempts,
				jobName: finalFailure.job.name,
				code: finalFailure.code,
				killed: finalFailure.killed,
				cwd: ctx.cwd,
			});
			ctx.ui.notify(summarizeFailure(finalFailure), "error");

			const maxFixAttempts = config.maxRetries ?? DEFAULT_MAX_RETRIES;
			if (fixAttempts <= maxFixAttempts) {
				pi.sendUserMessage(buildAgentFailureMessage(finalFailure, fixAttempts), { deliverAs: "followUp" });
			} else {
				ctx.ui.notify(`Post-edit checks still failing after ${maxFixAttempts} fix attempts. Not sending another fix turn.`, "error");
			}
		} finally {
			running = false;
			startingGitStatus = await getGitStatus(pi, ctx.cwd).catch(() => undefined);
			toolTouchedFiles = new Set<string>();
		}

		return undefined;
	});
}
