# pr-tools

Adds a PR update command:

- `/pr-update` — asks the agent to inspect the current PR diff, propose a high-signal PR title/body, ask for approval, then update the PR with `gh pr edit` if approved.
- `/pr-update --dry-run` — asks the agent to inspect the diff and propose the title/body only.

The command does not hard-code PR content. It gathers lightweight context (PR metadata, selected base ref, changed files, diff stat, commits, template paths, and instruction-file paths), then sends an agent prompt to read the actual diffs and generate the description dynamically.

Template lookup checks common locations such as `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/PULL_REQUEST_TEMPLATE/*.md`, and `docs/PULL_REQUEST_TEMPLATE.md`.

Additional PR-description instructions can be supplied in markdown files:

- Global: `~/.pi/pr-description.md`
- Project-specific: `.pi/pr-description.md`

The legacy name `pr-guidelines.md` is also accepted in either location, but `pr-description.md` is preferred because it matches the artifact being generated.

Requires `git` and GitHub CLI (`gh`) for PR updates.
