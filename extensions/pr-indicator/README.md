# PR Indicator

Shows a small Pi UI status/widget when the current git branch has an open GitHub PR.

- On session start, runs `gh pr view --json number,url,state,baseRefName,headRefName,title,isDraft`.
- If a PR exists, the status shows `PR #<number> <branch>→<base>` and a widget shows title, base/head, state, and URL.
- If no PR exists, the status shows `no PR (<branch>)`.
- Use `/pr-refresh` after changing branches or opening/closing a PR.
- Use `/skill:bswan0002-pr-review` to perform the actual review.

Requires `git` and optionally `gh` on PATH. Without `gh`, the indicator simply reports no PR.
