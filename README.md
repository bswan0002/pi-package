# @bswan0002/pi-package

Personal [pi](https://pi.dev) package for my macOS workflow. Some extensions may work on Linux, but Linux is not the primary target. If you want to use or customize this package, I recommend copying (degit) the repository and modifying as needed to suit your taste.

## Contents

### Extensions

- [`ask-user-question`](./extensions/ask-user-question) — adds an `ask_user_question` tool for structured TUI clarifying questions. Based on [juicesharp/rpiv-ask-user-question](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question).
- [`better-openai`](./extensions/better-openai) — adds standalone OpenAI fast mode and Codex usage/reset countdowns. Ported from [mattleong/pi-better-openai](https://github.com/mattleong/pi-better-openai), with footer integration adapted for this package.
- [`brave-search`](./extensions/brave-search) — Brave API search fallback for non-Codex models. Requires `BRAVE_SEARCH_API_KEY`.
- [`browser`](./extensions/browser) — bundles `@howaboua/pi-browser` for logged-in browser inspection and interaction through CDP in ordinary Pi and Code/Notebook.
- [`codex-web-run`](./extensions/codex-web-run) — bundles `@howaboua/pi-codex-web-run` for hosted web search and page navigation.
- [`codex-imagegen`](./extensions/codex-imagegen) — bundles `@howaboua/pi-codex-imagegen` for hosted image generation/editing.
- [`diff`](./extensions/diff) — Shiki-highlighted Pi `write`/`edit` diffs and conversion `apply_patch` display entries, including Code/Notebook calls. Based on [buddingnewinsights/pi-diff](https://github.com/buddingnewinsights/pi-diff).
- [`post-edit`](./extensions/post-edit) — runs project-configured commands after agent edits when `.pi/post-edit.json` exists.
- [`screenshot-picker`](./extensions/screenshot-picker) — stages screenshots for the next prompt. Use `/ss` or `Ctrl+Shift+S`; clear with `/ss-clear`. Based on [Graffioh/pi-screenshots-picker](https://github.com/Graffioh/pi-screenshots-picker).
- [`sounds`](./extensions/sounds) — plays configurable macOS sounds on pi and extension events.
- [`style`](./extensions/style) — installs the custom editor/statusline UI. Use `/pr-refresh` to refresh PR/git footer state. Based on [lmilojevicc/pi-zentui](https://github.com/lmilojevicc/pi-zentui).

### Skills

- [`confluence-export`](./skills/confluence-export) — fetches Atlassian Confluence Cloud pages and saves them as Markdown.
- [`pr-review`](./skills/pr-review) — performs a PR-style review of the current branch.
- [`qq`](./skills/qq) — answers questions using only readonly project inspection.
- [`writing-for-agents`](./skills/writing-for-agents) — guides writing skills, `AGENTS.md` / `CLAUDE.md`, and other agent-facing documents. From [Matt Pocock’s skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-for-agents); replaces `write-a-skill`.

Cloudability API, query, and staging skills now live in [cloudability/cldy-ui-skills](https://github.com/cloudability/cldy-ui-skills). Install them separately with `npx skills add cloudability/cldy-ui-skills`.

## Codex conversion compatibility

This package loads pinned `@howaboua/pi-codex-conversion`, `@howaboua/pi-codex-web-run`, `@howaboua/pi-codex-imagegen`, and `@howaboua/pi-browser` dependencies through local extension loaders. **Remove separately installed copies of all four from Pi's enabled packages/extensions** before restarting; loading both copies creates competing providers/tools. Also disable the legacy `browser.toml` custom tool if enabled. Global copies in an already-running Pi process are not changed by `npm ci` here.

Pi **1.0.0 or newer** is required by this package and its bundled Codex dependencies.

`npm ci` applies the tracked patch in `patches/` via `patch-package`. Install scripts must be enabled. Patch failures fail installation rather than silently dropping the integration. See [patch maintenance](./patches/README.md).

Recommended defaults are **Notebook mode** and **Compact V2** (`executionMode:
"notebook"`, `compaction.method: "v2"`). New installs need no settings changes.
Existing explicit global or trusted project preferences still take precedence;
missing settings inherit these defaults. Change them with `/codex` if desired.

- When conversion is loaded, it owns the Codex provider and connection lifecycle, regardless of extension load order. Without it, Better OpenAI installs its standalone transport at session startup.
- `/fast` toggles conversion's own fast setting on conversion-owned routes, without opening settings or maintaining a second preference. The patch routes this through conversion's save/apply lifecycle: trusted folder scope is preserved and busy runs apply when idle. A valid `PI_CODEX_FAST` environment override pins the setting; unset it and restart to use the toggle. This package's `--fast` remains standalone-only. Other supported routes retain the standalone toggle.
- Conversion's resolved fast state appears beside the model in our custom footer, not in the conversion status row. Conversion still controls the setting and request service tier.
- The style footer adds Better OpenAI's reset countdowns directly beside conversion's quotas (e.g. `weekly: 32% left · 1d18h ↺`). Hiding conversion's status restores the full usage/countdown row.
- Hosted `web_run` and `imagegen` tools compose as `tools.web__run` and `tools.image_gen__imagegen` inside Code/Notebook. `ask_user_question` remains blocking. `brave_search` is offered only on non-Codex models, including in Code/Notebook; renamed Codex transports also use hosted search.
- Browser composes as `tools.browser` in Code/Notebook. Enable remote debugging in Chrome at `chrome://inspect/#remote-debugging`, then restart Pi and begin with `await tools.browser("help")`. See [browser setup](./extensions/browser/README.md); no browser settings are changed automatically.
- The old `openai_image` tool, `/openai-image` command, and Better OpenAI `image` settings are removed. Existing `image` config sections are ignored; use the bundled companion's imagegen tool instead. Images save beneath the workspace in `.pi/openai-codex-images`.
- Post-edit observes direct and nested patch results, including partial failures, alongside Pi `edit`/`write` results and the existing Git-status fallback.
- Conversion owns execution and its tool renderers. Our diff extension subscribes to its display broker: completed patches appear at turn end, with file snapshots captured inside conversion's existing mutation queues. New/deleted files and multiple nested edits retain their actual before/after contents, even after session reload. Renames appear as deletion/addition of the respective paths. Partial failures retain conversion's recovery instructions alongside observed changes.
- Collapsed patch entries show small per-file previews; expand tools to see more (up to 150 diff rows per file). Wide terminals use split view; narrow ones use unified/wrapped rows. Snapshot reads are bounded to 80 KB per file and 1 MB per side per call; binary/unreadable/oversized files show an omission notice. Unsupported patch forms and old entries without snapshots retain a clearly labeled submitted-patch fallback.
- Screenshot staging, sounds, and the custom editor/footer remain independent.

The old Git permission guard has been removed. There is no replacement approval gate in this package; stale `piPackage.readonlyGitPermissions` settings and its sound-event entries can be deleted.

## Install locally

```bash
npx degit bswan0002/pi-package ~/Dev/pi-package
cd ~/Dev/pi-package
npm ci
pi install ~/Dev/pi-package
```

One run without installing:

```bash
pi -e ~/Dev/pi-package
```

After updating this checkout, run `npm ci` again and restart pi. Extensions load
dependencies from this directory; stale dependencies can drop tool definitions
even when the globally installed pi is up to date.

The bundled hosted tools require Node.js 22.19 or newer and Codex authentication
(`/login openai-codex`). They can also use Codex credentials while chatting with
another provider; Brave is the non-Codex fallback when hosted search is unavailable.

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
        "post-edit:failed": "/System/Library/Sounds/Ping.aiff"
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
| style/diff/post-edit/brave-search | yes     | likely         | Mostly Node/pi behavior; external tools may vary.                        |

## External dependencies

| Extension                | Optional/required tools                                                           | Notes                                                    |
| ------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| ask-user-question        | None                                                                              | Uses pi's interactive TUI.                               |
| better-openai            | OpenAI Codex OAuth                                                                | Use `/login openai-codex`; powers usage and image generation. |
| brave-search             | `BRAVE_SEARCH_API_KEY`                                                            | Environment variable required.                           |
| browser                  | Node.js 22.19+, Chrome-family browser with CDP enabled; optional SSH/SCP          | Logged-in browser control, not desktop control.          |
| confluence-export        | `ATLASSIAN_EMAIL`, `ATLASSIAN_API_KEY`, `curl`, `python3`, `pandoc`               | Environment variables required.                         |
| diff                     | Shiki npm dependencies                                                            | No major system tool expected.                           |
| post-edit                | project-configured commands                                                       | Runs whatever `.pi/post-edit.json` asks for.             |
| screenshot-picker        | macOS `defaults`, macOS `open`, Linux `xdg-open`, terminal image protocol support | Image previews need capable terminals.                   |
| sounds                   | macOS `afplay`                                                                    | Configurable sounds are macOS-targeted.                  |
| style                    | `git`, optional `gh`                                                              | GitHub PR footer segment uses GitHub CLI when available. |

# TODO

Maybe incorporate some settings management a la https://github.com/juanibiapina/pi-extension-settings
