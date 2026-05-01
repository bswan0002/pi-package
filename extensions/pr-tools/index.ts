import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const execFileAsync = promisify(execFile);

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
};

async function run(command: string, args: string[], cwd: string) {
	const { stdout } = await execFileAsync(command, args, {
		cwd,
		maxBuffer: 20 * 1024 * 1024,
	});
	return stdout.trim();
}

async function runOptional(command: string, args: string[], cwd: string) {
	try {
		return await run(command, args, cwd);
	} catch {
		return "";
	}
}

async function getRepoRoot(cwd: string) {
	const root = await runOptional("git", ["rev-parse", "--show-toplevel"], cwd);
	return root || cwd;
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
	} catch {
		return undefined;
	}
}

async function inferBaseRef(cwd: string, pr: PrInfo | undefined) {
	if (pr?.baseRefName) {
		await runOptional("git", ["fetch", "--quiet", "origin", pr.baseRefName], cwd);
		const remoteBase = `origin/${pr.baseRefName}`;
		const hasRemote = await runOptional("git", ["rev-parse", "--verify", "--quiet", remoteBase], cwd);
		return {
			baseRef: hasRemote ? remoteBase : pr.baseRefName,
			baseReason: "GitHub PR baseRefName",
		};
	}

	const upstream = await runOptional("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], cwd);
	const candidates = [upstream, "origin/main", "main", "origin/master", "master", "origin/develop", "develop", "origin/trunk", "trunk"].filter(Boolean);
	for (const candidate of candidates) {
		const exists = await runOptional("git", ["rev-parse", "--verify", "--quiet", candidate], cwd);
		if (exists) return { baseRef: candidate, baseReason: "inferred from upstream/default branch candidates" };
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
		if (existsSync(candidate)) return readFileSync(candidate, "utf8");
	}

	const templateDir = join(root, ".github", "PULL_REQUEST_TEMPLATE");
	if (existsSync(templateDir)) {
		const firstMarkdown = readdirSync(templateDir).find((file) => file.toLowerCase().endsWith(".md"));
		if (firstMarkdown) return readFileSync(join(templateDir, firstMarkdown), "utf8");
	}
	return "";
}

function filesByTopLevel(files: string[]) {
	const groups = new Map<string, string[]>();
	for (const file of files) {
		const [area = file] = file.split("/");
		groups.set(area, [...(groups.get(area) ?? []), file]);
	}
	return [...groups.entries()]
		.map(([area, areaFiles]) => `- ${area}: ${areaFiles.slice(0, 8).join(", ")}${areaFiles.length > 8 ? `, +${areaFiles.length - 8} more` : ""}`)
		.join("\n");
}

function inferTitle(context: Context) {
	if (context.pr?.title && !/^update|changes|wip$/i.test(context.pr.title.trim())) return context.pr.title.trim();
	const firstCommit = context.commits.split("\n").find(Boolean)?.replace(/^[a-f0-9]+\s+/, "");
	if (firstCommit) return firstCommit;
	const firstFile = context.changedFiles[0];
	return firstFile ? `Update ${dirname(firstFile) === "." ? firstFile : dirname(firstFile)}` : "Update PR";
}

function buildBody(context: Context) {
	const changedAreas = filesByTopLevel(context.changedFiles) || "- No changed files detected";
	const commits = context.commits
		.split("\n")
		.filter(Boolean)
		.slice(0, 10)
		.map((commit) => `- ${commit.replace(/^[a-f0-9]+\s+/, "")}`)
		.join("\n") || "- No unique commits detected";
	const validation = [
		"- [ ] Run targeted automated tests for the changed areas",
		"- [ ] Run lint/typecheck/build commands that apply to this repository",
		"- [ ] Manually verify the affected user flow or integration",
	].join("\n");

	const generated = `## Summary\n${commits}\n\n## Changed areas\n${changedAreas}\n\n## Validation\n${validation}\n\n## Notes\n- Base: \`${context.baseRef}\` (${context.baseReason})`;
	if (!context.template.trim()) return generated;
	return `${context.template.trim()}\n\n---\n\n${generated}`;
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
	};
}

function renderDraft(context: Context) {
	const title = inferTitle(context);
	const body = buildBody(context);
	return { title, body, markdown: `# PR draft\n\nTitle: ${title}\n\n${body}\n\n## Diff stat\n\n\`\`\`\n${context.stat}\n\`\`\`\n\n## Changed files\n\n\`\`\`\n${context.nameStatus}\n\`\`\`` };
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("pr-draft", {
		description: "Generate a PR title/body draft from the current branch, PR template, and diff",
		handler: async (_args, ctx) => {
			const context = await collectContext(ctx.cwd);
			const draft = renderDraft(context);
			ctx.ui.notify(draft.markdown, "info");
		},
	});

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
