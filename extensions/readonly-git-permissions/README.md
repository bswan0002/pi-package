# readonly-git-permissions

Blocks non-readonly git operations requested through pi's built-in `bash` tool.

Simple allowlisted read-only Git command sequences are allowed without prompting. Shell syntax is parsed with Tree-sitter: quoted data, comments, and literal heredoc contents do not become Git commands merely because they contain the word `git`. Mixed commands, redirects, and executable wrappers are sent through whole-command review. Anything else is blocked when no UI is available, or prompts for confirmation when UI is available. An opt-in policy can also automatically allow commands that the configured AI reviewer classifies as read-only with no reported writes.

In interactive mode, commands requiring confirmation are sent to a small model for a safety review. A compact, lightly padded, fully bordered overlay shows a concrete verdict, summary, modified state, uniformly code-colored command, and configured provider/model attribution. The safe default is **Block**, and automatic approval is disabled by default. If the custom UI or review is unavailable, confirmation falls back to the built-in dialog.

The reviewer resolves pipelines and wrappers into their concrete effects rather than explaining why the static gate was uncertain. It can inspect local text scripts/documentation and request fixed built-in Git/Herdr help invocations, with at most four inspections, four model calls, and a 30-second overall deadline. It cannot execute the pending command, run arbitrary shell commands, or send prompts to other agents. File/help excerpts are bounded and treated as untrusted evidence; credential-file paths are rejected. Outside-project file reads require an absolute path explicitly present in the command. Verdicts are not cached because inspected files and external state can change. It returns one of `read-only`, `mutating`, `destructive`, or `unknown`, plus a concise summary and the state actually written.

The default reviewer is `openai-codex/gpt-6-luna`. Omit the `model` setting to inherit the package-maintained default; explicit model settings remain unchanged. Configure or disable it in global or project settings:

```json
{
  "piPackage": {
    "readonlyGitPermissions": {
      "explainer": {
        "enabled": true,
        "provider": "openai-codex",
        "model": "gpt-6-luna",
        "autoAllowReadOnly": false
      }
    }
  }
}
```

Set `autoAllowReadOnly` to `true` to skip confirmation only when a valid review returns the `read-only` verdict and an empty `writes` array. This policy also applies without a UI. Mutating, destructive, unknown, unavailable, timed-out, and malformed reviews still require confirmation or are blocked when confirmation is unavailable.

Commands are treated as untrusted model input, and common token, credential, password, and authenticated-URL forms are redacted before review. Commands and inspected excerpts are sent to the configured model. Redaction is best-effort; disable the explainer if that data must remain local.

## Scoped event bus events

This extension emits only scoped `pi.events` names:

- `readonly-git-permissions:confirm-needed`
- `readonly-git-permissions:blocked`
- `readonly-git-permissions:allowed`

Payload shape:

```ts
{
  kind: "git-command";
  command: string;
  cwd: string;
  toolCallId: string;
  toolName: "bash";
  reason?: string;
  decision?: "ai-read-only" | "user";
  reviewer?: string;
  review?: {
    verdict: "read-only" | "mutating" | "destructive" | "unknown";
    summary: string;
    writes: string[];
  };
}
```

## Notes

This is an advisory Git permission gate, not a complete shell sandbox. Arbitrary scripts, aliases, dynamically generated commands, or other execution tools can conceal Git operations. The allowlist is intentionally conservative. For example, these are blocked or require confirmation:

- `git add .`
- `git commit -m "..."`
- `git checkout -b feature`
- `git branch new-branch`
- `git branch -D old-branch`
- `git config user.name "..."`
- `git status && git commit -m "..."`

Readonly examples allowed without prompting:

- `git status`
- `git diff --cached`
- `git log --oneline -5`
- `git show HEAD`
- `git branch --show-current`
- `git remote -v`
- `git config --get user.name`
