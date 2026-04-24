import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type PrInfo = {
	number: string;
	url: string;
	state: string;
	baseRefName: string;
	headRefName: string;
	title: string;
	isDraft: string;
};

const STATUS_KEY = "pr-indicator";

async function execText(pi: ExtensionAPI, command: string, args: string[], cwd: string, timeout = 8000) {
	const result = await pi.exec(command, args, { cwd, timeout });
	if (result.code !== 0) return undefined;
	return result.stdout.trim();
}

async function isGitRepo(pi: ExtensionAPI, cwd: string) {
	return (await execText(pi, "git", ["rev-parse", "--show-toplevel"], cwd, 3000)) !== undefined;
}

async function currentBranch(pi: ExtensionAPI, cwd: string) {
	return (await execText(pi, "git", ["branch", "--show-current"], cwd, 3000)) || "";
}

async function loadPrInfo(pi: ExtensionAPI, cwd: string): Promise<PrInfo | undefined> {
	const stdout = await execText(
		pi,
		"gh",
		["pr", "view", "--json", "number,url,state,baseRefName,headRefName,title,isDraft"],
		cwd,
		8000,
	);
	if (!stdout) return undefined;

	try {
		const parsed = JSON.parse(stdout) as Record<string, unknown>;
		return {
			number: String(parsed.number ?? ""),
			url: String(parsed.url ?? ""),
			state: String(parsed.state ?? ""),
			baseRefName: String(parsed.baseRefName ?? ""),
			headRefName: String(parsed.headRefName ?? ""),
			title: String(parsed.title ?? ""),
			isDraft: String(parsed.isDraft ?? ""),
		};
	} catch {
		return undefined;
	}
}

function renderStatus(pr: PrInfo, branch: string) {
	const draft = pr.isDraft === "true" ? " draft" : "";
	const base = pr.baseRefName ? `→${pr.baseRefName}` : "";
	return `PR #${pr.number}${draft} ${branch || pr.headRefName}${base}`.trim();
}

async function refresh(pi: ExtensionAPI, ctx: ExtensionContext, notify = false) {
	if (!(await isGitRepo(pi, ctx.cwd))) {
		ctx.ui.setStatus(STATUS_KEY, "");
		ctx.ui.setWidget(STATUS_KEY, []);
		return;
	}

	const branch = await currentBranch(pi, ctx.cwd);
	const pr = await loadPrInfo(pi, ctx.cwd);
	if (!pr) {
		ctx.ui.setStatus(STATUS_KEY, branch ? `no PR (${branch})` : "no PR");
		ctx.ui.setWidget(STATUS_KEY, []);
		if (notify) ctx.ui.notify("No open GitHub PR found for this branch.", "info");
		return;
	}

	ctx.ui.setStatus(STATUS_KEY, renderStatus(pr, branch));
	ctx.ui.setWidget(STATUS_KEY, [
		`GitHub PR #${pr.number}: ${pr.title}`,
		`Base: ${pr.baseRefName}  Head: ${pr.headRefName}  State: ${pr.state}${pr.isDraft === "true" ? "  Draft" : ""}`,
		pr.url,
		"Run /skill:bswan0002-pr-review to review the PR diff.",
	]);
	if (notify) ctx.ui.notify(`Found PR #${pr.number} targeting ${pr.baseRefName}.`, "info");
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		await refresh(pi, ctx, false);
	});

	pi.registerCommand("pr-refresh", {
		description: "Refresh the GitHub PR status indicator for the current branch",
		handler: async (_args, ctx) => {
			await refresh(pi, ctx, true);
		},
	});
}
