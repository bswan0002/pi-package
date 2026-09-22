import { createRequire } from "node:module";
import { basename } from "node:path";
import { Language, Parser, type Node } from "web-tree-sitter";

const require = createRequire(import.meta.url);
let parserPromise: Promise<Parser> | undefined;
function getParser() {
	return parserPromise ??= (async () => {
		await Parser.init();
		const parser = new Parser();
		// Reuse the grammar distributed with our pinned Codex dependency.
		parser.setLanguage(await Language.load(require.resolve(
			"@howaboua/pi-codex-conversion/vendor/tree-sitter-bash/tree-sitter-bash.wasm",
		)));
		return parser;
	})();
}

export type GitAnalysis = { hasGit: boolean; plainCommands?: string[][] };
const shells = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const wrappers = new Set(["command", "builtin", "env", "sudo", "xargs", "find", "timeout", "nice", "nohup", "watch", "eval"]);
const dataCommands = new Set(["echo", "printf", "grep", "rg", "cat", "head", "tail", "wc"]);
const interpreters = /^(?:python[\d.]*|node|ruby|perl|php|deno|bun)$/;
const mentionsGit = (text: string) => /\bgit\b/i.test(text);
const unquote = (text: string) => text.replace(/^(['"])([\s\S]*)\1$/, "$2");

/** Structural detection, not a security sandbox. Unknown syntax never gets the fast path. */
export async function analyzeGitCommand(source: string): Promise<GitAnalysis> {
	try {
		return analyze(await getParser(), source, 0);
	} catch {
		// A missing parser must not silently bypass review of a possible Git command.
		return { hasGit: mentionsGit(source) };
	}
}

function analyze(parser: Parser, source: string, depth: number): GitAnalysis {
	if (depth > 8 || source.length > 128_000) return { hasGit: mentionsGit(source) };
	const tree = parser.parse(source);
	if (!tree) return { hasGit: mentionsGit(source) };
	try {
		if (tree.rootNode.hasError) return { hasGit: mentionsGit(source) };
		let hasGit = false;
		let plain = true;
		const commands: string[][] = [];
		const simpleKinds = new Set(["program", "list", "pipeline", "command", "command_name", "word", "number", "string", "string_content", "raw_string"]);
		function visit(node: Node) {
			if (!simpleKinds.has(node.type)) plain = false;
			if (node.type === "command") {
				const name = basename(unquote(node.childForFieldName("name")?.text ?? ""));
				const words = node.namedChildren.map((child) => unquote(child.text));
				const nameNode = node.childForFieldName("name");
				if (nameNode && /[$`]/.test(nameNode.text)) hasGit ||= mentionsGit(source);
				commands.push(words);
				if (name === "git") hasGit = true;
				else if (shells.has(name)) {
					const scriptIndex = words.findIndex((word) => /^-[a-z]*c[a-z]*$/.test(word));
					if (scriptIndex >= 0 && words[scriptIndex + 1]) hasGit ||= analyze(parser, words[scriptIndex + 1], depth + 1).hasGit;
					// A shell can consume executable code from a here-document.
					const parent = node.parent;
					if (parent?.type === "redirected_statement") {
						for (const redirect of parent.namedChildren.filter((child) => child.type === "heredoc_redirect")) {
							const body = redirect.namedChildren.find((child) => child.type === "heredoc_body");
							if (body) hasGit ||= analyze(parser, body.text, depth + 1).hasGit;
						}
					}
				} else if (wrappers.has(name)) {
					// Let the reviewer resolve executable arguments; never auto-allow wrappers.
					hasGit ||= mentionsGit(node.text);
				} else if (interpreters.test(name)) {
					const code = node.parent?.type === "redirected_statement" ? node.parent.text : node.text;
					// A literal "git" in JSON/Python data isn't execution. Interpreter code
					// that also launches processes is ambiguous and belongs with the reviewer.
					hasGit ||= mentionsGit(code) && /\b(?:subprocess|system|popen|spawn|exec\w*|child_process|run|Command)\b/.test(code);
				} else if (!dataCommands.has(name)) {
					hasGit ||= words.slice(1).some((word) => /(?:^|[\s;/])git(?:\s|$)/.test(word));
				}
			}
			// Tree-sitter exposes command substitutions even in expandable heredocs;
			// literal quoted heredoc bodies and string contents have no command nodes.
			for (const child of node.namedChildren) visit(child);
		}
		visit(tree.rootNode);
		return { hasGit, plainCommands: plain ? commands : undefined };
	} finally {
		tree.delete();
	}
}
