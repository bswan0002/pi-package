import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const execFileAsync = promisify(execFile);
const WEAK_TITLES = /^(update|updates|changes|wip|work in progress|misc|miscellaneous)$/i;

type PrInfo = {
	number?: number;
	url?: string;
	title?: string;
	body?: string;
	baseRefName?: string;
	headRefName?: string;
	isDraft?: boolean;
};

type Context = {
	root: string;
	branch: string;
	baseRef: string;
	baseReason: string;
	pr?: PrInfo;
	changedFiles: string[];
	nameStatus: string;
	stat: string;
	commits: string;
	template: string;
	instructions: string;
	packageScripts: Record<string, string>;
};

async function run(command: string, args: string[], cwd: string) {
	const { stdout } = await execFileAsync(command, args, { cwd, maxBuffer: 20 * 1024 * 1024 });
	return stdout.trim();
}

async function runOptional(command: string, args: string[], cwd: string) {
	try { return await run(command, args, cwd); } catch { return ""; }
}

function readIfExists(path: string) {
	try { return existsSync(path) ? readFileSync(path, "utf8") : ""; } catch { return ""; }
}

async function getRepoRoot(cwd: string) {
	return (await runOptional("git", ["rev-parse", "--show-toplevel"], cwd)) || cwd;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

async function getPrInfo(cwd: string): Promise<PrInfo | undefined> {
	const json = await runOptional("gh", ["pr", "view", "--json", "number,url,title,body,baseRefName,headRefName,isDraft"], cwd);
	if (!json) return undefined;
	try {
		const parsed: unknown = JSON.parse(json);
		if (!isRecord(parsed)) return undefined;
		return {
			number: typeof parsed.number === "number" ? parsed.number : undefined,
			url: typeof parsed.url === "string" ? parsed.url : undefined,
			title: typeof parsed.title === "string" ? parsed.title : undefined,
			body: typeof parsed.body === "string" ? parsed.body : undefined,
			baseRefName: typeof parsed.baseRefName === "string" ? parsed.baseRefName : undefined,
			headRefName: typeof parsed.headRefName === "string" ? parsed.headRefName : undefined,
			isDraft: typeof parsed.isDraft === "boolean" ? parsed.isDraft : undefined,
		};
	} catch { return undefined; }
}

async function inferBaseRef(cwd: string, pr: PrInfo | undefined) {
	if (pr?.baseRefName) {
		await runOptional("git", ["fetch", "--quiet", "origin", pr.baseRefName], cwd);
		const remoteBase = `origin/${pr.baseRefName}`;
		const hasRemote = await runOptional("git", ["rev-parse", "--verify", "--quiet", remoteBase], cwd);
		return { baseRef: hasRemote ? remoteBase : pr.baseRefName, baseReason: "GitHub PR baseRefName" };
	}
	const upstream = await runOptional("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], cwd);
	const candidates = [upstream, "origin/main", "main", "origin/master", "master", "origin/develop", "develop", "origin/trunk", "trunk"].filter(Boolean);
	for (const candidate of candidates) {
		if (await runOptional("git", ["rev-parse", "--verify", "--quiet", candidate], cwd)) return { baseRef: candidate, baseReason: "inferred from upstream/default branch candidates" };
	}
	return { baseRef: "HEAD~1", baseReason: "fallback; could not infer base branch" };
}

function findPrTemplate(root: string) {
	const directCandidates = [
		join(root, ".github", "pull_request_template.md"),
		join(root, ".github", "PULL_REQUEST_TEMPLATE.md"),
		join(root, "docs", "pull_request_template.md"),
		join(root, "docs", "PULL_REQUEST_TEMPLATE.md"),
		join(root, "pull_request_template.md"),
		join(root, "PULL_REQUEST_TEMPLATE.md"),
	];
	for (const candidate of directCandidates) {
		const text = readIfExists(candidate);
		if (text) return text;
	}
	const templateDir = join(root, ".github", "PULL_REQUEST_TEMPLATE");
	if (existsSync(templateDir)) {
		const firstMarkdown = readdirSync(templateDir).find((file) => file.toLowerCase().endsWith(".md"));
		if (firstMarkdown) return readIfExists(join(templateDir, firstMarkdown));
	}
	return "";
}

function findPrInstructions(root: string) {
	const candidates = [
		join(homedir(), ".pi", "pr-description.md"),
		join(homedir(), ".pi", "pr-guidelines.md"),
		join(root, ".pi", "pr-description.md"),
		join(root, ".pi", "pr-guidelines.md"),
		join(root, ".github", "pr-description.md"),
	];
	return candidates.map((path) => readIfExists(path).trim()).filter(Boolean).join("\n\n---\n\n");
}

function readPackageScripts(root: string) {
	try {
		const parsed: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
		if (!isRecord(parsed) || !isRecord(parsed.scripts)) return {};
		return Object.fromEntries(Object.entries(parsed.scripts).filter(([, value]) => typeof value === "string")) as Record<string, string>;
	} catch { return {}; }
}

function filesByTopLevel(files: string[]) {
	const groups = new Map<string, string[]>();
	for (const file of files) {
		const [area = file] = file.split("/");
		groups.set(area, [...(groups.get(area) ?? []), file]);
	}
	return [...groups.entries()].map(([area, areaFiles]) => `- \`${area}\`: ${areaFiles.slice(0, 8).map((file) => `\`${file}\``).join(", ")}${areaFiles.length > 8 ? `, +${areaFiles.length - 8} more` : ""}`).join("\n");
}

function cleanCommitSubject(line: string) {
	return line.replace(/^[a-f0-9]+\s+/, "").replace(/^\([^)]*\)\s*/, "").trim();
}

function isWeakText(text: string) {
	return !text || WEAK_TITLES.test(text.trim());
}

function humanizePath(path: string) {
	return path.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferTitle(context: Context) {
	if (context.pr?.title && !isWeakText(context.pr.title)) return context.pr.title.trim();
	const meaningfulCommit = context.commits.split("\n").map(cleanCommitSubject).find((subject) => !isWeakText(subject));
	if (meaningfulCommit) return meaningfulCommit;
	if (context.changedFiles.some((file) => file.startsWith("extensions/pr-tools/"))) return "Add PR drafting tools";
	if (context.changedFiles.some((file) => file.startsWith("skills/pr-validation/"))) return "Add PR validation skill";
	const firstFile = context.changedFiles[0];
	return firstFile ? `Update ${dirname(firstFile) === "." ? firstFile : humanizePath(dirname(firstFile))}` : "Update PR";
}

function inferSummaryBullets(context: Context) {
	const bullets: string[] = [];
	if (context.changedFiles.some((file) => file.startsWith("extensions/pr-tools/"))) {
		bullets.push("Add a `pr-tools` extension with `/pr-update` for previewing, confirming, and applying generated PR titles/bodies via `gh pr edit`.");
		bullets.push("Build PR update context from GitHub PR metadata, inferred base branch, changed files, diff stats, commits, repository PR templates, and PR description instructions.");
	}
	if (context.changedFiles.some((file) => file.startsWith("skills/pr-validation/"))) {
		bullets.push("Add a `pr-validation` skill that generates practical PR verification plans from the current branch or PR diff.");
	}
	if (context.changedFiles.includes("README.md")) bullets.push("Document the new commands, skills, and external dependency requirements.");
	if (bullets.length) return bullets;
	const commits = context.commits.split("\n").map(cleanCommitSubject).filter((subject) => !isWeakText(subject)).slice(0, 5);
	return commits.length ? commits : ["Summarize the branch changes and affected areas before merge."];
}

function inferValidation(context: Context) {
	const checks: string[] = [];
	if (context.packageScripts.typecheck) checks.push("Run package typecheck/build (`npm run typecheck`).");
	else checks.push("Run the repository's applicable typecheck/build command.");
	if (context.changedFiles.some((file) => file.startsWith("extensions/pr-tools/"))) {
		checks.push("Run `/pr-update --dry-run` on a branch with an open GitHub PR and verify the generated title/body preview is specific and useful without modifying the PR.");
		checks.push("Run `/pr-update`, cancel at confirmation, and verify no PR changes are applied.");
		checks.push("Optionally confirm `/pr-update` on a test PR and verify `gh pr edit` updates title/body correctly.");
	}
	if (context.changedFiles.some((file) => file.startsWith("skills/pr-validation/"))) {
		checks.push("Invoke the `pr-validation` skill and verify it detects PR metadata, base ref, changed files, commits, and suggested diff commands.");
	}
	return checks.map((check) => `- [ ] ${check}`).join("\n");
}

function buildBody(context: Context) {
	const summary = inferSummaryBullets(context).map((bullet) => `- ${bullet}`).join("\n");
	const changedAreas = filesByTopLevel(context.changedFiles) || "- No changed files detected";
	const validation = inferValidation(context);
	const notes = [
		`- Base: \`${context.baseRef}\` (${context.baseReason})`,
		context.pr?.url ? `- PR: ${context.pr.url}` : undefined,
		context.instructions ? "- Additional PR authoring instructions were loaded from `.pi/pr-description.md` / `~/.pi/pr-description.md`." : undefined,
	].filter(Boolean).join("\n");
	const generated = `## Summary\n${summary}\n\n## Changed areas\n${changedAreas}\n\n## Validation\n${validation}\n\n## Notes\n${notes}`;
	const guidance = context.instructions ? `\n\n<!-- PR description instructions loaded for reference:\n${context.instructions}\n-->` : "";
	if (!context.template.trim()) return `${generated}${guidance}`;
	return `${context.template.trim()}\n\n---\n\n${generated}${guidance}`;
}

async function collectContext(cwd: string): Promise<Context> {
	const root = await getRepoRoot(cwd);
	const pr = await getPrInfo(root);
	const { baseRef, baseReason } = await inferBaseRef(root, pr);
	const branch = await runOptional("git", ["branch", "--show-current"], root);
	const changedFilesText = await runOptional("git", ["diff", "--name-only", `${baseRef}...HEAD`], root);
	return {
		root,
		branch: branch || "HEAD",
		baseRef,
		baseReason,
		pr,
		changedFiles: changedFilesText.split("\n").filter(Boolean),
		nameStatus: await runOptional("git", ["diff", "--name-status", `${baseRef}...HEAD`], root),
		stat: await runOptional("git", ["diff", "--stat", `${baseRef}...HEAD`], root),
		commits: await runOptional("git", ["log", "--oneline", "--decorate", "--no-merges", `${baseRef}..HEAD`], root),
		template: findPrTemplate(root),
		instructions: findPrInstructions(root),
		packageScripts: readPackageScripts(root),
	};
}

function renderDraft(context: Context) {
	const title = inferTitle(context);
	const body = buildBody(context);
	return { title, body, markdown: `# PR draft\n\nTitle: ${title}\n\n${body}\n\n## Diff stat\n\n\`\`\`\n${context.stat}\n\`\`\`\n\n## Changed files\n\n\`\`\`\n${context.nameStatus}\n\`\`\`` };
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("pr-update", {
		description: "Preview and apply a generated PR title/body with gh pr edit",
		handler: async (args, ctx) => {
			const dryRun = args.includes("--dry-run");
			const context = await collectContext(ctx.cwd);
			const draft = renderDraft(context);
			ctx.ui.notify(draft.markdown, "info");
			if (dryRun) return;
			const ok = await ctx.ui.confirm("Update PR?", "Run gh pr edit with this generated title and body?");
			if (!ok) return;
			await run("gh", ["pr", "edit", "--title", draft.title, "--body", draft.body], context.root);
			ctx.ui.notify("Updated PR title and body.", "info");
		},
	});
}
