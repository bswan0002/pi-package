import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
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
	templatePaths: string[];
	instructionPaths: string[];
};

async function run(command: string, args: string[], cwd: string) {
	const { stdout } = await execFileAsync(command, args, { cwd, maxBuffer: 20 * 1024 * 1024 });
	return stdout.trim();
}

async function runOptional(command: string, args: string[], cwd: string) {
	try { return await run(command, args, cwd); } catch { return ""; }
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

async function inferBaseRef(cwd: string, pr: PrInfo | undefined, currentBranch: string) {
	if (pr?.baseRefName) {
		await runOptional("git", ["fetch", "--quiet", "origin", pr.baseRefName], cwd);
		const remoteBase = `origin/${pr.baseRefName}`;
		const hasRemote = await runOptional("git", ["rev-parse", "--verify", "--quiet", remoteBase], cwd);
		return { baseRef: hasRemote ? remoteBase : pr.baseRefName, baseReason: "GitHub PR baseRefName" };
	}
	const upstream = await runOptional("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], cwd);
	const upstreamIsHead = currentBranch && (upstream === currentBranch || upstream === `origin/${currentBranch}`);
	const candidates = [
		upstreamIsHead ? "" : upstream,
		"origin/main",
		"main",
		"origin/master",
		"master",
		"origin/develop",
		"develop",
		"origin/trunk",
		"trunk",
	].filter((candidate): candidate is string => Boolean(candidate));
	for (const candidate of candidates) {
		if (await runOptional("git", ["rev-parse", "--verify", "--quiet", candidate], cwd)) return { baseRef: candidate, baseReason: "inferred from upstream/default branch candidates" };
	}
	return { baseRef: "HEAD~1", baseReason: "fallback; could not infer base branch" };
}

function existing(paths: string[]) {
	return paths.filter((path) => existsSync(path));
}

function findPrTemplatePaths(root: string) {
	const direct = existing([
		join(root, ".github", "pull_request_template.md"),
		join(root, ".github", "PULL_REQUEST_TEMPLATE.md"),
		join(root, "docs", "pull_request_template.md"),
		join(root, "docs", "PULL_REQUEST_TEMPLATE.md"),
		join(root, "pull_request_template.md"),
		join(root, "PULL_REQUEST_TEMPLATE.md"),
	]);
	const templateDir = join(root, ".github", "PULL_REQUEST_TEMPLATE");
	if (!existsSync(templateDir)) return direct;
	const nested = readdirSync(templateDir)
		.filter((file) => file.toLowerCase().endsWith(".md"))
		.map((file) => join(templateDir, file));
	return [...direct, ...nested];
}

function findInstructionPaths(root: string) {
	return existing([
		join(homedir(), ".pi", "pr-description.md"),
		join(homedir(), ".pi", "pr-guidelines.md"),
		join(root, ".pi", "pr-description.md"),
		join(root, ".pi", "pr-guidelines.md"),
		join(root, ".github", "pr-description.md"),
	]);
}

async function collectContext(cwd: string): Promise<Context> {
	const root = await getRepoRoot(cwd);
	const pr = await getPrInfo(root);
	const branch = await runOptional("git", ["branch", "--show-current"], root);
	const { baseRef, baseReason } = await inferBaseRef(root, pr, branch);
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
		templatePaths: findPrTemplatePaths(root),
		instructionPaths: findInstructionPaths(root),
	};
}

function shellQuote(value: string) {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function buildAgentPrompt(context: Context, dryRun: boolean) {
	const pr = context.pr;
	const templateList = context.templatePaths.length ? context.templatePaths.map((path) => `- ${path}`).join("\n") : "- none found";
	const instructionList = context.instructionPaths.length ? context.instructionPaths.map((path) => `- ${path}`).join("\n") : "- none found";
	return `Generate a high-signal GitHub PR description for the current branch by reading the actual diff, similar to the pr-review skill's inspection workflow, but produce a PR title/body instead of review findings.

Do not rely on commit subjects alone. If commits or the current PR title are weak (for example \`wip\`, \`update\`, \`changes\`), ignore them and infer intent from the diff.

Context:
- Repository root: \`${context.root}\`
- Base: \`${context.baseRef}\` (${context.baseReason})
- Head: \`${context.branch}\`
- Diff: \`${context.baseRef}...HEAD\`
- PR: ${pr?.number ? `#${pr.number} ${pr.url ?? ""}` : "none detected"}
- Current PR title: ${pr?.title ? `\`${pr.title}\`` : "none"}
- Draft PR: ${typeof pr?.isDraft === "boolean" ? pr.isDraft : "unknown"}

PR templates to read and follow when relevant:
${templateList}

Additional PR description instructions to read and follow when present:
${instructionList}

Initial changed-file summary:
\`\`\`
${context.nameStatus || "No changed files detected"}
\`\`\`

Diff stat:
\`\`\`
${context.stat || "No diff stat available"}
\`\`\`

Commits, for secondary context only:
\`\`\`
${context.commits || "No unique commits detected"}
\`\`\`

Workflow:
1. Read any listed PR templates and PR description instruction files.
2. Inspect the actual diff with commands like:
   - \`git diff --stat ${context.baseRef}...HEAD\`
   - \`git diff --name-status ${context.baseRef}...HEAD\`
   - \`git diff ${context.baseRef}...HEAD -- <important path>\`
3. Read surrounding files when needed to understand behavior.
4. Produce a concise but thorough PR title and body with:
   - Summary bullets that explain what changed and why it matters.
   - Changed areas grouped by behavior/component, not just raw file paths.
   - Specific validation steps tied to the actual changes.
   - Notes/assumptions at the bottom, including the selected base.
5. Avoid generic validation filler.

Output format:
\`\`\`md
Title: <proposed title>

<body markdown>
\`\`\`

${dryRun ? "This is a dry run: only propose the title/body; do not update GitHub." : `After showing the proposal, ask me before applying it. If I approve, update the PR with: \`gh pr edit --title <title> --body <body>\` from ${shellQuote(context.root)}.`}`;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("pr-update", {
		description: "Ask the agent to inspect the PR diff and propose/apply an updated PR title/body",
		handler: async (args, ctx) => {
			const dryRun = args.includes("--dry-run");
			const context = await collectContext(ctx.cwd);
			const prompt = buildAgentPrompt(context, dryRun);
			if (ctx.isIdle()) {
				ctx.ui.notify("Handing PR diff context to the agent for dynamic PR description generation.", "info");
				pi.sendUserMessage(prompt);
			} else {
				pi.sendUserMessage(prompt, { deliverAs: "followUp" });
				ctx.ui.notify("Queued PR diff context for the agent after the current turn.", "info");
			}
		},
	});
}
