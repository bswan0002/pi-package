# @bswan0002/pi-package

Personal [pi](https://pi.dev) package for the owner's macOS workflow. Some extensions may work on Linux, but Linux is not the primary target. If you want to use or customize this package, copy or degit the repository and adapt it for your setup.

## Contents

### Extensions

- [`brave-search`](./extensions/brave-search) — adds a `brave_search` tool backed by the Brave Search API. Requires `BRAVE_SEARCH_API_KEY`.
- [`diff`](./extensions/diff) — replaces pi's `write` and `edit` rendering with Shiki-highlighted diffs.
- [`post-edit`](./extensions/post-edit) — runs project-configured commands after agent edits when `.pi/post-edit.json` exists.
- [`readonly-git-permissions`](./extensions/readonly-git-permissions) — blocks non-readonly git operations unless confirmed.
- [`screenshot-picker`](./extensions/screenshot-picker) — stages screenshots for the next prompt. Use `/ss` or `Ctrl+Shift+S`; clear with `/ss-clear`.
- [`sounds`](./extensions/sounds) — plays configurable macOS sounds on pi and extension events.
- [`style`](./extensions/style) — installs the custom editor/statusline UI. Use `/pr-refresh` to refresh PR/git footer state.

### Skills

- [`pr-review`](./skills/pr-review) — performs a PR-style review of the current branch.
- [`qq`](./skills/qq) — answers questions using only readonly project inspection.

## Install locally

```bash
npx degit bswan0002/pi-package ~/Dev/pi-package
pi install ~/Dev/pi-package
```

One run without installing:

```bash
pi -e ~/Dev/pi-package
```

## Naming

The package name retains `bswan0002` because this is a personal package tied to the GitHub username. Skill names, extension commands, events, and config keys avoid unnecessary personal namespacing.

## Shared config

Global `~/.pi/agent/settings.json` is the base; project `.pi/settings.json` overrides it when present.

```json
{
  "piPackage": {
    "screenshotPicker": { "sources": ["~/Pictures/Screenshots"] },
    "sounds": {
      "piEvents": { "agent_end": "/System/Library/Sounds/Glass.aiff" },
      "extensionEvents": { "readonly-git-permissions:confirm-needed": "/System/Library/Sounds/Ping.aiff" }
    },
    "diff": { "theme": "midnight", "colors": {} },
    "style": { "icons": {}, "colors": {} }
  }
}
```

## Platform support

| Area | macOS | Linux | Notes |
| --- | --- | --- | --- |
| Package target | primary | may work | Personal workflow targets macOS. |
| screenshot-picker | yes | partial/yes | Linux paths and `xdg-open` exist; thumbnails depend on terminal support. |
| sounds | yes | no/unsupported | Uses `afplay`. |
| style/diff/post-edit/readonly-git-permissions/brave-search | yes | likely | Mostly Node/pi behavior; external tools may vary. |

## External dependencies

| Extension | Optional/required tools | Notes |
| --- | --- | --- |
| brave-search | `BRAVE_SEARCH_API_KEY` | Environment variable required. |
| diff | Shiki npm dependencies | No major system tool expected. |
| post-edit | project-configured commands | Runs whatever `.pi/post-edit.json` asks for. |
| readonly-git-permissions | `git` | Intercepts `bash` git invocations. |
| screenshot-picker | macOS `defaults`, macOS `open`, Linux `xdg-open`, terminal image protocol support | Image previews need capable terminals. |
| sounds | macOS `afplay` | Configurable sounds are macOS-targeted. |
| style | `git`, optional `gh` | GitHub PR footer segment uses GitHub CLI when available. |
