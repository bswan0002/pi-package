# pr-tools

Adds PR drafting commands:

- `/pr-draft` — generate and display a PR title/body draft from current PR metadata, git diff context, commits, changed files, and any pull request template found in the repo.
- `/pr-update` — preview the same draft, ask for confirmation, then run `gh pr edit --title ... --body ...`.
- `/pr-update --dry-run` — preview only.

Template lookup checks common locations such as `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/PULL_REQUEST_TEMPLATE/*.md`, and `docs/PULL_REQUEST_TEMPLATE.md`.

Requires `git` and GitHub CLI (`gh`) for PR updates.
