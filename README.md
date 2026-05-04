# @bswan0002/pi-package

Personal [pi](https://pi.dev) package for my macOS workflow. Some extensions may work on Linux, but Linux is not the primary target. If you want to use or customize this package, I recommend copying (degit) the repository and modifying as needed to suit your taste.

## Contents

### Extensions

- [`ask-user-question`](./extensions/ask-user-question) — adds an `ask_user_question` tool for structured TUI clarifying questions. Based on [juicesharp/rpiv-ask-user-question](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question).
- [`better-openai`](./extensions/better-openai) — adds OpenAI fast mode, Codex usage status, and OpenAI image generation. Ported from [mattleong/pi-better-openai](https://github.com/mattleong/pi-better-openai), with footer integration adapted for this package.
- [`brave-search`](./extensions/brave-search) — adds a `brave_search` tool backed by the Brave Search API. Requires `BRAVE_SEARCH_API_KEY`.
- [`diff`](./extensions/diff) — replaces pi's `write` and `edit` rendering with Shiki-highlighted diffs. Based on [buddingnewinsights/pi-diff](https://github.com/buddingnewinsights/pi-diff).
- [`post-edit`](./extensions/post-edit) — runs project-configured commands after agent edits when `.pi/post-edit.json` exists.
- [`readonly-git-permissions`](./extensions/readonly-git-permissions) — blocks non-readonly git operations unless confirmed.
- [`screenshot-picker`](./extensions/screenshot-picker) — stages screenshots for the next prompt. Use `/ss` or `Ctrl+Shift+S`; clear with `/ss-clear`. Based on [Graffioh/pi-screenshots-picker](https://github.com/Graffioh/pi-screenshots-picker).
- [`sounds`](./extensions/sounds) — plays configurable macOS sounds on pi and extension events.
- [`style`](./extensions/style) — installs the custom editor/statusline UI. Use `/pr-refresh` to refresh PR/git footer state. Based on [lmilojevicc/pi-zentui](https://github.com/lmilojevicc/pi-zentui).

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

## Shared config

Global `~/.pi/agent/settings.json` is the base; project `.pi/settings.json` overrides it when present. Example package-specific settings:

```json
{
  "theme": "dark-plus",
  "piPackage": {
    "screenshotPicker": {
      "sources": [
        "~/screenshots"
      ]
    },
    "sounds": {
      "piEvents": {
        "agent_end": "/System/Library/Sounds/Glass.aiff"
      },
      "extensionEvents": {
        "readonly-git-permissions:confirm-needed": "/System/Library/Sounds/Ping.aiff"
      }
    }
  }
}
```

## Platform support

| Area                                                       | macOS   | Linux          | Notes                                                                    |
| ---------------------------------------------------------- | ------- | -------------- | ------------------------------------------------------------------------ |
| Package target                                             | primary | may work       | Personal workflow targets macOS.                                         |
| screenshot-picker                                          | yes     | partial/yes    | Linux paths and `xdg-open` exist; thumbnails depend on terminal support. |
| sounds                                                     | yes     | no/unsupported | Uses `afplay`.                                                           |
| style/diff/post-edit/readonly-git-permissions/brave-search | yes     | likely         | Mostly Node/pi behavior; external tools may vary.                        |

## External dependencies

| Extension                | Optional/required tools                                                           | Notes                                                    |
| ------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| ask-user-question        | None                                                                              | Uses pi's interactive TUI.                               |
| better-openai            | OpenAI Codex OAuth                                                                | Use `/login openai-codex`; powers usage and image generation. |
| brave-search             | `BRAVE_SEARCH_API_KEY`                                                            | Environment variable required.                           |
| diff                     | Shiki npm dependencies                                                            | No major system tool expected.                           |
| post-edit                | project-configured commands                                                       | Runs whatever `.pi/post-edit.json` asks for.             |
| readonly-git-permissions | `git`                                                                             | Intercepts `bash` git invocations.                       |
| screenshot-picker        | macOS `defaults`, macOS `open`, Linux `xdg-open`, terminal image protocol support | Image previews need capable terminals.                   |
| sounds                   | macOS `afplay`                                                                    | Configurable sounds are macOS-targeted.                  |
| style                    | `git`, optional `gh`                                                              | GitHub PR footer segment uses GitHub CLI when available. |

# TODO

Maybe incorporate some settings management a la https://github.com/juanibiapina/pi-extension-settings