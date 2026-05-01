# pr-tools

Adds a PR update command:

- `/pr-update` — generate and preview a PR title/body from current PR metadata, git diff context, commits, changed files, package scripts, PR authoring instructions, and any pull request template found in the repo; then ask for confirmation and run `gh pr edit --title ... --body ...`.
- `/pr-update --dry-run` — preview only.

Drafts prefer high-signal summaries and validation steps over raw commit subjects. Weak commit messages/titles such as `wip`, `update`, or `changes` are ignored when possible.

Template lookup checks common locations such as `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/PULL_REQUEST_TEMPLATE/*.md`, and `docs/PULL_REQUEST_TEMPLATE.md`.

Additional PR-description instructions can be supplied in markdown files:

- Global: `~/.pi/pr-description.md`
- Project-specific: `.pi/pr-description.md`

The legacy name `pr-guidelines.md` is also accepted in either location, but `pr-description.md` is preferred because it matches the artifact being generated.

Requires `git` and GitHub CLI (`gh`) for PR updates.
