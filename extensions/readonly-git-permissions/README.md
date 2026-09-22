# readonly-git-permissions

Blocks non-readonly git operations requested through pi's built-in `bash` tool.

Simple allowlisted read-only Git command sequences are allowed without prompting. Shell syntax is parsed with Tree-sitter: quoted data, comments, and literal heredoc contents do not become Git commands merely because they contain the word `git`. Mixed commands, redirects, and executable wrappers are sent through whole-command review. Anything else is blocked when no UI is available, or prompts for confirmation when UI is available. An opt-in policy can also automatically allow commands whose **Git effects** the AI reviewer classifies as read-only or absent. Ordinary file edits, output files, and test caches are allowed alongside read-only Git commands; they are not Git mutations.

In interactive mode, commands requiring confirmation are sent to a small model for a safety review. A height-bounded, fully bordered overlay shows a concrete verdict, summary, modified state, uniformly code-colored command, and configured provider/model attribution. Block/Allow remain pinned below scrollable details. Use Page Up/Page Down or Home/End to scroll; arrows and Enter select a decision, and Escape blocks. The viewport adapts on resize. The safe default is **Block**, and automatic approval is disabled by default. If the custom UI or review is unavailable, confirmation falls back to the built-in dialog.

The reviewer resolves pipelines and wrappers into their concrete effects rather than explaining why the static gate was uncertain. It can search project source for registrations/helpers, page through local text scripts/documentation, request fixed built-in Git/Herdr help invocations, and read Herdr metadata for explicitly referenced targets, with at most eight inspections, seven model calls, and a 60-second overall deadline. Source search examines at most 500 directory entries and the first 12 KB of each eligible source file; exclusions and truncation are not proof of absence. Local source and target metadata do not prove which implementation a different running session loaded. It cannot execute the pending command, run arbitrary shell commands, or send prompts to other agents. File/help excerpts are bounded and treated as untrusted evidence; credential-file paths are rejected. Outside-project file reads require an absolute path explicitly present in the command. Verdicts are not cached because inspected files and external state can change. It returns an overall `verdict` (`read-only`, `mutating`, `destructive`, or `unknown`), a separate `gitEffect` (the same values plus `none`), a concise summary, and the state actually written. Authorization uses `gitEffect`; ordinary writes remain honestly reported under the overall verdict. The modal headline describes Git effects, not general file writes. An initial uninvestigated unknown Git effect gets an explicit evidence-gathering follow-up. Contradictory verdicts (read-only with writes, or mutating/destructive without writes) get one evidence-based correction attempt, then fail closed if still inconsistent. The reviewer is instructed to distinguish exact slash-command dispatch from arbitrary delegated tasks, follow handler implementations, and name specific missing evidence when unresolved. Unknown verdicts display writes as undetermined (alongside any established writes), never as `none`. Inspection does not itself authorize execution: unresolved delegation still requires confirmation.

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

Set `autoAllowReadOnly` to `true` to skip confirmation when a valid, consistent review returns `gitEffect: "read-only"` or `"none"`, even if the overall command edits files. The existing setting name and `ai-read-only` event decision are retained; they refer to Git effects. For example, appending a test followed by `git diff`, or `git diff > report.txt`, qualifies. This policy also applies without a UI. Git mutations—including `git add`, `git commit`, branch creation, and direct writes to Git metadata—still require confirmation, as do destructive or unresolved Git effects and unavailable, timed-out, malformed, or missing Git assessments. Without confirmation UI these are blocked. This extension is not a general filesystem-write safeguard.

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
    gitEffect: "none" | "read-only" | "mutating" | "destructive" | "unknown";
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
