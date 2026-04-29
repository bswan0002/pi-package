# @bswan0002/pi-package

Personal [pi](https://pi.dev) package for bswan0002 extensions and skills.

## Contents

### Extensions

- [`brave-search`](./extensions/brave-search) — adds a `brave_search` tool backed by the Brave Search API. Requires `BRAVE_SEARCH_API_KEY` in the environment.
- [`post-edit`](./extensions/post-edit) — runs project-configured format/lint/typecheck commands after agent edits when the project contains `.pi/post-edit.json`.
- [`readonly-git-permissions`](./extensions/readonly-git-permissions) — blocks non-readonly git operations from the `bash` tool unless confirmed in the UI.
- [`screenshot-picker`](./extensions/screenshot-picker) — opens a screenshot browser for staging images that attach to the next prompt. Use `/bswan0002-screenshot-picker` or `Ctrl+Shift+S`.
- [`sounds`](./extensions/sounds) — plays distinct macOS sounds on agent end and permission prompts.
- [`style`](./extensions/style) — installs the custom editor/statusline UI, including a clickable GitHub PR segment in the footer when the current branch has a PR. Use `/pr-refresh` to refresh PR/git footer state.

### Skills

- [`bswan0002-pr-review`](./skills/bswan0002-pr-review) — performs a PR-style review of the current branch, using GitHub PR metadata when available and otherwise inferring the likely base branch.
- [`bswan0002-qq`](./skills/bswan0002-qq) — answers questions using only readonly project inspection.

## Install locally

From another project, install this package into pi settings with:

```bash
pi install /Users/ben/Dev/pi-package
```

Or try it for one run without installing:

```bash
pi -e /Users/ben/Dev/pi-package
```

## Naming convention

Skill names use the Agent Skills-compatible namespace prefix:

```text
bswan0002-<skill-name>
```

Custom extension bus events are scoped as:

```text
bswan0002:<extension-name>:<event-name>
```

For example:

```text
bswan0002:readonly-git-permissions:confirm-needed
```
