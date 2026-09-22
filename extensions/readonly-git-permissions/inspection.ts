import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, open, realpath, readdir } from "node:fs/promises";
import { delimiter, isAbsolute, relative, resolve } from "node:path";
import { Type } from "typebox";

const MAX_OUTPUT = 12_000;
export const REVIEW_TOOLS = [
	{
		name: "read_review_file",
		description: "Read a bounded local source/documentation excerpt without executing it. Use offset to follow referenced handlers/imports beyond the first excerpt. Credential files are forbidden. Offsets are bytes.",
		parameters: Type.Object({ path: Type.String(), offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 2_000_000 })) }),
	},
	{
		name: "search_review_source",
		description: "Search local project source/documentation for a literal command name, registration, or handler. Returns paths, byte offsets, and excerpts. Does not prove another agent loaded this source. Bounded search; no matches is not proof of absence.",
		parameters: Type.Object({ text: Type.String({ minLength: 2, maxLength: 100 }) }),
	},
	{
		name: "inspect_herdr_agent",
		description: "Read Herdr metadata for a target explicitly mentioned in the pending command using fixed `herdr agent get`. Never sends a prompt or reads conversation/credentials. Metadata identifies the target but does not prove its loaded command implementation.",
		parameters: Type.Object({ target: Type.String() }),
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

async function readExcerpt(path: string, offset: number, signal: AbortSignal) {
	const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
	try {
		if (!(await handle.stat()).isFile()) throw new Error("Only regular files can be inspected");
		const buffer = Buffer.alloc(MAX_OUTPUT + 1);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
		signal.throwIfAborted();
		if (buffer.subarray(0, bytesRead).includes(0)) throw new Error("Binary file cannot be inspected");
		return buffer.subarray(0, Math.min(bytesRead, MAX_OUTPUT)).toString("utf8") + (bytesRead > MAX_OUTPUT ? `\n[truncated; continue at byte offset ${offset + MAX_OUTPUT}]` : "");
	} finally {
		await handle.close();
	}
}

async function installedCli(cli: string, argv: string[], cwd: string, signal: AbortSignal) {
	const root = await realpath(cwd);
	let executable: string | undefined;
	for (const directory of (process.env.PATH ?? "").split(delimiter)) {
		if (!directory || !isAbsolute(directory)) continue;
		try {
			const path = await realpath(resolve(directory, cli));
			if (inside(path, root)) continue;
			await access(path, constants.X_OK);
			executable = path;
			break;
		} catch { /* Try the next installed executable. */ }
	}
	if (!executable) throw new Error(`No trusted installed ${cli} executable found`);
	const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
	env.GIT_PAGER = "cat";
	env.PAGER = "cat";
	return await new Promise<string>((resolveOutput, reject) => {
		execFile(executable, argv, { cwd: "/", signal, timeout: 3_000, maxBuffer: 32_000, encoding: "utf8", env }, (error, stdout, stderr) => {
			if (signal.aborted) return reject(signal.reason);
			if (error && (error.killed || typeof error.code !== "number")) return reject(error);
			const output = `${stdout}\n${stderr}`.trim();
			resolveOutput((error ? `[exit ${error.code}]\n` : "") + output.slice(0, MAX_OUTPUT) + (output.length > MAX_OUTPUT ? "\n[truncated]" : ""));
		});
	});
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
		const offset = args.offset ?? 0;
		if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 2_000_000) throw new Error("Invalid byte offset");
		const root = await realpath(cwd);
		const path = await realpath(resolve(root, args.path));
		if (sensitive(args.path) || sensitive(path)) throw new Error("Credential files cannot be inspected");
		if (!inside(path, root) && !(isAbsolute(args.path) && command.includes(args.path))) {
			throw new Error("Outside-project files must be explicitly referenced by absolute path in the command");
		}
		return readExcerpt(path, offset, signal);
	}
	if (name === "search_review_source") {
		if (typeof args.text !== "string" || args.text.length < 2 || args.text.length > 100) throw new Error("Expected a literal source search (2–100 characters)");
		const needle = args.text;
		const root = await realpath(cwd);
		const queue = [root];
		const matches: string[] = [];
		let visited = 0;
		let outputSize = 0;
		while (queue.length && visited < 500 && outputSize < MAX_OUTPUT) {
			signal.throwIfAborted();
			for (const entry of await readdir(queue.shift()!, { withFileTypes: true })) {
				if (++visited > 500 || outputSize >= MAX_OUTPUT) break;
				if (entry.isSymbolicLink() || entry.name.startsWith(".") || ["node_modules", "vendor", "dist", "build"].includes(entry.name)) continue;
				const path = resolve(entry.parentPath, entry.name);
				if (sensitive(path)) continue;
				const canonical = await realpath(path);
				if (!inside(canonical, root) || sensitive(canonical)) continue;
				if (entry.isDirectory()) { queue.push(canonical); continue; }
				if (!entry.isFile() || !/\.(?:[cm]?[jt]sx?|md|py|sh|rs)$/.test(entry.name)) continue;
				// Bound total I/O as well as output. Large files can be paged explicitly.
				const text = await readExcerpt(canonical, 0, signal);
				let index = text.indexOf(needle);
				for (let count = 0; index >= 0 && count < 3 && outputSize < MAX_OUTPUT; count++) {
					const start = Math.max(0, index - 160);
					const hit = `${relative(root, canonical)} byte ${Buffer.byteLength(text.slice(0, start))}:\n${text.slice(start, index + needle.length + 400)}`;
					matches.push(hit);
					outputSize += hit.length;
					index = text.indexOf(needle, index + needle.length);
				}
			}
		}
		return (matches.join("\n\n").slice(0, MAX_OUTPUT) || "No matches in inspected excerpts.") + "\n[Bounded search: at most 500 entries, first 12000 bytes/file; not proof of absence or target runtime identity.]";
	}
	if (name === "inspect_herdr_agent") {
		if (typeof args.target !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_:.-]{0,100}$/.test(args.target) ||
			!command.split(/[^a-zA-Z0-9_:.-]+/).includes(args.target)) throw new Error("Target must be explicitly referenced in the command");
		return installedCli("herdr", ["agent", "get", args.target], cwd, signal);
	}
	if (name !== "review_cli_help") throw new Error("Unknown inspection tool");
	const cli = args.cli;
	const subcommands = args.subcommands;
	if ((cli !== "git" && cli !== "herdr") || !Array.isArray(subcommands) || subcommands.length > 2 ||
		!subcommands.every((part) => typeof part === "string" && /^[a-z][a-z-]*$/.test(part))) {
		throw new Error("Help accepts only Git/Herdr command names");
	}
	const gitCommands = new Set(["status", "diff", "log", "show", "branch", "remote", "config", "reset", "restore", "checkout", "switch", "clean", "add", "commit", "push", "fetch", "pull", "merge", "rebase", "stash", "tag", "count-objects", "rev-parse"]);
	const herdrCommands = new Set(["api", "agent", "pane", "workspace", "tab", "session", "notification", "worktree", "integration"]);
	if (cli === "git" && (subcommands.length > 1 || (subcommands.length === 1 && !gitCommands.has(subcommands[0])))) throw new Error("Only built-in Git help is supported");
	if (cli === "herdr" && subcommands.length && !herdrCommands.has(subcommands[0])) throw new Error("Unsupported Herdr help topic");
	return installedCli(cli, cli === "git" ? ["--no-pager", ...subcommands, "-h"] : [...subcommands, "--help"], cwd, signal);
}
