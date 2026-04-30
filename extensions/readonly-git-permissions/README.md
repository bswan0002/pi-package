# readonly-git-permissions

Blocks non-readonly git operations requested through pi's built-in `bash` tool.

Readonly git operations are allowed without prompting. Anything else is blocked when no UI is available, or prompts for confirmation when UI is available.

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
