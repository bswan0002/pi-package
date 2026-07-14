# readonly-git-permissions

Blocks non-readonly git operations requested through pi's built-in `bash` tool.

Readonly git operations are allowed without prompting. Anything else is blocked when no UI is available, or prompts for confirmation when UI is available.

In interactive mode, commands requiring confirmation are sent to a small model for an advisory safety explanation. A compact, lightly padded, fully bordered overlay shows a concrete verdict, summary, modified state, uniformly code-colored command, and configured provider/model attribution. The safe default is **Block**, and the model never approves commands automatically. If the custom UI or review is unavailable, confirmation falls back to the built-in dialog.

The reviewer resolves pipelines and wrappers into their concrete effects rather than explaining why the static gate was uncertain. It returns one of `read-only`, `mutating`, `destructive`, or `unknown`, plus a concise summary and the state actually written.

The default reviewer is `openai-codex/gpt-5.6-luna`. Configure or disable it in global or project settings:

```json
{
  "piPackage": {
    "readonlyGitPermissions": {
      "explainer": {
        "enabled": true,
        "provider": "openai-codex",
        "model": "gpt-5.6-luna"
      }
    }
  }
}
```

Commands are treated as untrusted model input, and common token, credential, password, and authenticated-URL forms are redacted before review. Because arbitrary shell text can still contain sensitive data, disable the explainer if commands must not be sent to the configured provider.

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
}
```

## Notes

The allowlist is intentionally conservative. For example, these are blocked or require confirmation:

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
