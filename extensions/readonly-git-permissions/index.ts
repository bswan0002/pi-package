import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const EXTENSION_NAME = "readonly-git-permissions";

export const EVENTS = {
	CONFIRM_NEEDED: `bswan0002:${EXTENSION_NAME}:confirm-needed`,
	BLOCKED: `bswan0002:${EXTENSION_NAME}:blocked`,
	ALLOWED: `bswan0002:${EXTENSION_NAME}:allowed`,
} as const;

const READONLY_GIT_SUBCOMMANDS = new Set([
	"status",
	"diff",
	"log",
	"show",
	"rev-parse",
	"describe",
	"ls-files",
	"ls-tree",
	"ls-remote",
	"blame",
	"grep",
	"show-ref",
	"for-each-ref",
	"merge-base",
	"name-rev",
	"cat-file",
]);

const GIT_GLOBAL_OPTIONS_WITH_VALUE = new Set([
	"-C",
	"-c",
	"--git-dir",
	"--work-tree",
	"--namespace",
	"--config-env",
	"--exec-path",
]);

const GIT_GLOBAL_FLAGS = new Set([
	"--bare",
	"--help",
	"--html-path",
	"--icase-pathspecs",
	"--literal-pathspecs",
	"--man-path",
	"--no-pager",
	"--no-replace-objects",
	"--noglob-pathspecs",
	"--paginate",
	"--version",
	"-v",
]);

const READONLY_BRANCH_FLAGS = new Set([
	"--all",
	"--contains",
	"--format",
	"--list",
	"--merged",
	"--no-abbrev",
	"--no-color",
	"--no-column",
	"--no-contains",
	"--no-merged",
	"--points-at",
	"--remotes",
	"--show-current",
	"--sort",
	"--verbose",
	"-a",
	"-r",
	"-v",
	"-vv",
]);

const READONLY_BRANCH_FLAGS_WITH_VALUE = new Set([
	"--contains",
	"--format",
	"--merged",
	"--no-contains",
	"--no-merged",
	"--points-at",
	"--sort",
]);

const MUTATING_BRANCH_FLAGS = new Set([
	"--copy",
	"--delete",
	"--edit-description",
	"--force",
	"--move",
	"--set-upstream-to",
	"--track",
	"--unset-upstream",
	"-C",
	"-D",
	"-M",
	"-c",
	"-d",
	"-f",
	"-m",
	"-t",
	"-u",
]);

const READONLY_CONFIG_ACTIONS = new Set([
	"--get",
	"--get-all",
	"--get-color",
	"--get-colorbool",
	"--get-regexp",
	"--get-urlmatch",
	"--list",
	"--name-only",
	"-l",
]);

const CONFIG_SCOPE_OR_SOURCE_FLAGS = new Set([
	"--blob",
	"--file",
	"--global",
	"--local",
	"--show-origin",
	"--show-scope",
	"--system",
	"--worktree",
	"-f",
]);

const CONFIG_FLAGS_WITH_VALUE = new Set(["--blob", "--file", "-f"]);

function stripMatchingQuotes(value: string) {
	const first = value.at(0);
	const last = value.at(-1);
	if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
		return value.slice(1, -1);
	}
	return value;
}

function tokenizeShellWords(segment: string) {
	const tokens: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let escaping = false;

	for (const char of segment) {
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}

		if (char === "\\" && quote !== "'") {
			escaping = true;
			continue;
		}

		if (quote) {
			if (char === quote) quote = undefined;
			else current += char;
			continue;
		}

		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}

		if (/\s/.test(char)) {
			if (current) {
				tokens.push(current);
				current = "";
			}
			continue;
		}

		current += char;
	}

	if (escaping) current += "\\";
	if (current) tokens.push(current);
	return tokens.map(stripMatchingQuotes);
}

function splitShellStatements(command: string) {
	const statements: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let escaping = false;

	for (let i = 0; i < command.length; i++) {
		const char = command[i];
		const next = command[i + 1];

		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}

		if (char === "\\" && quote !== "'") {
			current += char;
			escaping = true;
			continue;
		}

		if (quote) {
			current += char;
			if (char === quote) quote = undefined;
			continue;
		}

		if (char === "'" || char === '"') {
			quote = char;
			current += char;
			continue;
		}

		if (char === ";" || char === "\n" || char === "|" || (char === "&" && next === "&")) {
			if (current.trim()) statements.push(current.trim());
			current = "";
			if ((char === "&" && next === "&") || (char === "|" && next === "|")) i++;
			continue;
		}

		current += char;
	}

	if (current.trim()) statements.push(current.trim());
	return statements;
}

function isAssignment(token: string) {
	return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function gitTokensFromStatement(statement: string) {
	const tokens = tokenizeShellWords(statement);
	if (tokens.length === 0) return undefined;

	let index = 0;
	if (tokens[index] === "command" || tokens[index] === "builtin") index++;

	while (isAssignment(tokens[index] ?? "")) index++;

	if (tokens[index] === "env") {
		index++;
		while (index < tokens.length) {
			const token = tokens[index];
			if (isAssignment(token)) {
				index++;
				continue;
			}
			if (token === "-u" || token === "--unset") {
				index += 2;
				continue;
			}
			if (token === "-i" || token === "--ignore-environment") {
				index++;
				continue;
			}
			break;
		}
	}

	if (tokens[index] === "git") return tokens.slice(index);

	// If a statement mentions git but it is wrapped in another command (e.g. sudo,
	// xargs, sh -c), treat it as a git operation we cannot safely classify.
	if (tokens.includes("git")) return ["git", "__wrapped_git_command__"];

	return undefined;
}

function consumeGitGlobalOptions(tokens: string[]) {
	let index = 1;
	while (index < tokens.length) {
		const token = tokens[index];

		if (GIT_GLOBAL_OPTIONS_WITH_VALUE.has(token)) {
			index += 2;
			continue;
		}

		if ([...GIT_GLOBAL_OPTIONS_WITH_VALUE].some((option) => token.startsWith(`${option}=`))) {
			index++;
			continue;
		}

		if (GIT_GLOBAL_FLAGS.has(token)) {
			index++;
			continue;
		}

		if (token.startsWith("-")) return undefined;
		return index;
	}

	return index;
}

function flagName(token: string) {
	return token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
}

function isReadonlyBranch(args: string[]) {
	if (args.length === 0) return true;

	let sawListMode = false;
	let positionalCount = 0;

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		const flag = flagName(arg);

		if (MUTATING_BRANCH_FLAGS.has(flag)) return false;

		if (arg.startsWith("-")) {
			if (!READONLY_BRANCH_FLAGS.has(flag)) return false;
			if (flag === "--list" || flag === "--contains" || flag === "--no-contains" || flag === "--merged" || flag === "--no-merged" || flag === "--points-at") {
				sawListMode = true;
			}
			if (READONLY_BRANCH_FLAGS_WITH_VALUE.has(flag) && !arg.includes("=") && args[index + 1] && !args[index + 1].startsWith("-")) index++;
			continue;
		}

		positionalCount++;
	}

	// A bare positional argument (`git branch new-name`) creates a branch. Positionals
	// are only readonly when paired with an explicit list/query flag.
	return positionalCount === 0 || sawListMode;
}

function isReadonlyRemote(args: string[]) {
	if (args.length === 0) return true;
	if (args.length === 1 && args[0] === "-v") return true;

	const [subcommand] = args;
	return subcommand === "show" || subcommand === "get-url";
}

function isReadonlyConfig(args: string[]) {
	let sawReadonlyAction = false;

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		const flag = flagName(arg);

		if (READONLY_CONFIG_ACTIONS.has(flag)) {
			sawReadonlyAction = true;
			continue;
		}

		if (CONFIG_SCOPE_OR_SOURCE_FLAGS.has(flag)) {
			if (CONFIG_FLAGS_WITH_VALUE.has(flag) && !arg.includes("=")) {
				if (!args[index + 1] || args[index + 1].startsWith("-")) return false;
				index++;
			}
			continue;
		}

		if (arg.startsWith("-")) return false;
	}

	return sawReadonlyAction;
}

function isReadonlySymbolicRef(args: string[]) {
	let positionalCount = 0;

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "-m") return false;
		if (arg === "--short" || arg === "--quiet" || arg === "-q") continue;
		if (arg.startsWith("-")) return false;
		positionalCount++;
	}

	return positionalCount <= 1;
}

function isReadonlyGitInvocation(tokens: string[]) {
	const subcommandIndex = consumeGitGlobalOptions(tokens);
	if (subcommandIndex === undefined) return false;

	const subcommand = tokens[subcommandIndex]?.toLowerCase();
	const args = tokens.slice(subcommandIndex + 1);

	if (!subcommand) return true;
	if (subcommand === "help" || subcommand === "version") return true;
	if (READONLY_GIT_SUBCOMMANDS.has(subcommand)) return true;
	if (subcommand === "branch") return isReadonlyBranch(args);
	if (subcommand === "remote") return isReadonlyRemote(args);
	if (subcommand === "config") return isReadonlyConfig(args);
	if (subcommand === "symbolic-ref") return isReadonlySymbolicRef(args);

	return false;
}

export function isGitCommand(command: string) {
	return splitShellStatements(command).some((statement) => gitTokensFromStatement(statement));
}

export function isReadonlyGitCommand(command: string) {
	const gitInvocations = splitShellStatements(command)
		.map(gitTokensFromStatement)
		.filter((tokens): tokens is string[] => tokens !== undefined);

	return gitInvocations.length > 0 && gitInvocations.every(isReadonlyGitInvocation);
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;

		const command = String(event.input.command ?? "");
		if (!isGitCommand(command)) return undefined;
		if (isReadonlyGitCommand(command)) return undefined;

		const payload = {
			kind: "git-command",
			command,
			cwd: ctx.cwd,
			toolCallId: event.toolCallId,
			toolName: event.toolName,
		};

		if (!ctx.hasUI) {
			const reason = "Blocked non-readonly git command (no UI available for confirmation).";
			pi.events.emit(EVENTS.BLOCKED, { ...payload, reason });
			return { block: true, reason };
		}

		pi.events.emit(EVENTS.CONFIRM_NEEDED, payload);

		const ok = await ctx.ui.confirm(
			"Allow git command?",
			`This git command is not on the readonly allowlist:\n\n${command}\n\nAllow it?`,
		);

		if (!ok) {
			const reason = "Blocked by user";
			pi.events.emit(EVENTS.BLOCKED, { ...payload, reason });
			return { block: true, reason };
		}

		pi.events.emit(EVENTS.ALLOWED, payload);
		return undefined;
	});
}
