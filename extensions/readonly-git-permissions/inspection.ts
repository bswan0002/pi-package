import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, open, realpath } from "node:fs/promises";
import { delimiter, isAbsolute, relative, resolve } from "node:path";
import { Type } from "typebox";

const MAX_OUTPUT = 12_000;
export const REVIEW_TOOLS = [
	{
		name: "read_review_file",
		description: "Read a bounded text excerpt of a local script or documentation to determine command effects. Never executes the file. Credential files are forbidden.",
		parameters: Type.Object({ path: Type.String() }),
	},
	{
		name: "review_cli_help",
		description: "Consult built-in help for Git or Herdr only. Supply command names, never a pending command, flags, targets, paths, or prompts. This only runs a fixed help invocation.",
		parameters: Type.Object({ cli: Type.Union([Type.Literal("git"), Type.Literal("herdr")]), subcommands: Type.Array(Type.String(), { maxItems: 2 }) }),
	},
];

function inside(path: string, directory: string) {
	const rel = relative(directory, path);
	return !isAbsolute(rel) && rel !== ".." && !rel.startsWith("../");
}
function sensitive(path: string) {
	return /(?:^|[/\\])(?:\.env(?:\.[^/\\]*)?|auth\.json|credentials(?:\.[^/\\]*)?|\.ssh|\.aws|\.gnupg|id_rsa|id_ed25519)(?:$|[/\\])/i.test(path);
}

export async function inspectReviewTool(
	name: string,
	args: Record<string, unknown>,
	cwd: string,
	command: string,
	signal: AbortSignal,
): Promise<string> {
	signal.throwIfAborted();
	if (name === "read_review_file") {
		if (typeof args.path !== "string" || !args.path) throw new Error("Expected a file path");
		const root = await realpath(cwd);
		const path = await realpath(resolve(root, args.path));
		if (sensitive(args.path) || sensitive(path)) throw new Error("Credential files cannot be inspected");
		if (!inside(path, root) && !(isAbsolute(args.path) && command.includes(args.path))) {
			throw new Error("Outside-project files must be explicitly referenced by absolute path in the command");
		}
		const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
		try {
			if (!(await handle.stat()).isFile()) throw new Error("Only regular files can be inspected");
			const buffer = Buffer.alloc(MAX_OUTPUT + 1);
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
			signal.throwIfAborted();
			if (buffer.subarray(0, bytesRead).includes(0)) throw new Error("Binary file cannot be inspected");
			return buffer.subarray(0, Math.min(bytesRead, MAX_OUTPUT)).toString("utf8") + (bytesRead > MAX_OUTPUT ? "\n[truncated; remaining effects may be unresolved]" : "");
		} finally {
			await handle.close();
		}
	}
	if (name !== "review_cli_help") throw new Error("Unknown inspection tool");
	const cli = args.cli;
	const subcommands = args.subcommands;
	if ((cli !== "git" && cli !== "herdr") || !Array.isArray(subcommands) || subcommands.length > 2 ||
		!subcommands.every((part) => typeof part === "string" && /^[a-z][a-z-]*$/.test(part))) {
		throw new Error("Help accepts only Git/Herdr command names");
	}
	// Never allow arbitrary Git aliases/external subcommands: they could ignore -h.
	const gitCommands = new Set(["status", "diff", "log", "show", "branch", "remote", "config", "reset", "restore", "checkout", "switch", "clean", "add", "commit", "push", "fetch", "pull", "merge", "rebase", "stash", "tag", "count-objects", "rev-parse"]);
	const herdrCommands = new Set(["api", "agent", "pane", "workspace", "tab", "session", "notification", "worktree", "integration"]);
	if (cli === "git" && (subcommands.length > 1 || (subcommands.length === 1 && !gitCommands.has(subcommands[0])))) {
		throw new Error("Only built-in Git help is supported");
	}
	if (cli === "herdr" && subcommands.length && !herdrCommands.has(subcommands[0])) throw new Error("Unsupported Herdr help topic");
	const root = await realpath(cwd);
	let executable: string | undefined;
	for (const directory of (process.env.PATH ?? "").split(delimiter)) {
		if (!directory || !isAbsolute(directory)) continue;
		try {
			const path = await realpath(resolve(directory, cli));
			if (inside(path, root)) continue; // Never execute a project-provided lookalike.
			await access(path, constants.X_OK);
			executable = path;
			break;
		} catch { /* Try the next installed executable. */ }
	}
	if (!executable) throw new Error(`No trusted installed ${cli} executable found`);
	const argv = cli === "git" ? ["--no-pager", ...subcommands, "-h"] : [...subcommands, "--help"];
	// Help must not inherit Git tracing destinations or injected Git config.
	const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
	env.GIT_PAGER = "cat";
	env.PAGER = "cat";
	return await new Promise<string>((resolveOutput, reject) => {
		execFile(executable, argv, { cwd: "/", signal, timeout: 3_000, maxBuffer: 32_000, encoding: "utf8", env }, (error, stdout, stderr) => {
			if (signal.aborted) return reject(signal.reason);
			// Git usage commonly exits 129. A timeout/overflow is not a successful inspection.
			if (error && (error.killed || typeof error.code !== "number")) return reject(error);
			const output = `${stdout}\n${stderr}`.trim();
			resolveOutput(output.slice(0, MAX_OUTPUT) + (output.length > MAX_OUTPUT ? "\n[truncated]" : ""));
		});
	});
}
