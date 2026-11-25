# @bswan0002/pi-package

Personal [pi](https://pi.dev) package for my macOS workflow. Some extensions may work on Linux, but Linux is not the primary target. If you want to use or customize this package, I recommend copying (degit) the repository and modifying as needed to suit your taste.

## Contents

### Extensions

- [`fast`](./extensions/fast) — provider-neutral /fast shortcut; Codex Conversion owns fast mode and inline usage/reset countdowns.
- [`browser`](./extensions/browser) — bundles `@howaboua/pi-browser` for logged-in browser inspection and interaction through CDP in ordinary Pi and Code/Notebook.
- [`codex-web-run`](./extensions/codex-web-run) — bundles `@howaboua/pi-codex-web-run` for hosted web search and page navigation.
- [`codex-imagegen`](./extensions/codex-imagegen) — bundles `@howaboua/pi-codex-imagegen` for hosted image generation/editing.
- [`diff`](./extensions/diff) — Shiki-highlighted Pi `write`/`edit` diffs and conversion `apply_patch` display entries, including Code/Notebook calls. Based on [buddingnewinsights/pi-diff](https://github.com/buddingnewinsights/pi-diff).
- [`post-edit`](./extensions/post-edit) — runs project-configured commands after agent edits when `.pi/post-edit.json` exists.
- [`screenshot-picker`](./extensions/screenshot-picker) — stages screenshots for the next prompt. Use `/ss` or `Ctrl+Shift+S`; clear with `/ss-clear`. Based on [Graffioh/pi-screenshots-picker](https://github.com/Graffioh/pi-screenshots-picker).
- [`sounds`](./extensions/sounds) — plays configurable macOS sounds on pi and extension events.
- [`style`](./extensions/style) — installs the custom editor/statusline UI. Use `/pr-refresh` to refresh PR/git footer state. Based on [lmilojevicc/pi-zentui](https://github.com/lmilojevicc/pi-zentui).

## Codex conversion compatibility

This package loads pinned `@howaboua/pi-codex-conversion`, `@howaboua/pi-codex-web-run`, `@howaboua/pi-codex-imagegen`, and `@howaboua/pi-browser`, and `@howaboua/pi-notes-compaction` dependencies through local extension loaders. **Remove separately installed copies of all five from Pi's enabled packages/extensions** before restarting; loading both copies creates competing providers/tools. Also disable the legacy `browser.toml` custom tool if enabled. Global copies in an already-running Pi process are not changed by `npm ci` here.

Pi **1.5.0 or newer** is required by this package and its bundled Codex dependencies.
The pinned development and compatibility-test baseline is **Pi 1.6.1**; see the
[release assessment](./patches/README.md#pi-161-compatibility-2026-11-25).
Pi 1.6.1 splits transcript notices into `notices.cacheMisses`, `cacheWarming`,
`compactionCosts` and `reasoningDrops` under `/settings`. An existing
`showCacheMissNotices` value seeds all four; explicit per-notice values win.
This changes notice display, not cache-warming behavior or tool permissions.
The eight Pi baseline packages resolve to 1.6.1; bundled Howaboua packages retain
their exact schema 1.6.0 dependency alongside Pi's schema 1.6.1.
Pi now defaults to idle cache warming, which can make paid refreshes for up to
30 minutes after a run. Existing explicit cache-warming settings remain effective.

**Upgrading an existing Code/Notebook session:** install the updated package first, then run `/reload` in that still-running Pi session and complete one turn before restarting Pi. The reload must load conversion 4.0.5 or newer; reloading the old version before installation does not perform this migration. Code mode now always uses the pinned official runtime; `tools.customRustBinariesDir` no longer overrides Code mode (other helper overrides are unchanged).

**Notes migration in 4.0.5:** built-in Notes/history and legacy Remote mode were removed upstream. The bundled Notes extension preserves explicit legacy Notes continuity via `/notes`, importing global and trusted-project preferences on first use. Existing Notes settings win; old conversion configuration is not rewritten. Fresh installs keep Compact V2 and leave Notes inactive (an empty model whitelist). Enable Notes explicitly in `/notes` if desired. Remove any separately enabled Notes extension to avoid duplicates.

**Notes 0.0.13 model roles:** `/roles` is read-only. Configure role IDs, descriptions, providers, models and reasoning in `notes-compaction/model-roles.json` under the Pi agent directory. Defined roles are agent-operated; the former `enabled` flag and accept/dismiss controls no longer apply. `new_context({role})` checkpoints before switching model/reasoning. Notes must be active for the session and target model; fresh installs remain inactive. Omit `role` to retain the current model.

**Notes 0.0.14:** older checkpoints may need a fresh note save before rollover. Built-in Pi codemode now returns Notes results as objects; remove `JSON.parse` around those results. Existing shared-note paths are retained as agent references move to Pi session IDs.

**Notes 0.0.15:** locally saved shared checkpoints remain readable after workers close, and saved-session reads tolerate concurrent appends. Existing note paths and inactive defaults are retained; no settings migration is needed.

**Conversion 4.0.10 / Notes 0.0.16:** Code and Notebook add `content()` for ordered mixed text/images; idle agents can wake for uncollected background-shell completions. Notes adds explicit Off and defers inactive startup while retaining saved data and history boundaries. Typed Notes calls accept `content` for `text` and `end_line` for `stop_line`; results omit routine bookkeeping but retain content and recovery warnings. Existing inactive defaults and explicit settings remain intact. Imagegen 0.0.14 and Notes now require conversion 4.0.10; all three use Pi's native schema validation.

**Notes 0.0.18 / imagegen 0.0.15 / Web Run 0.0.11:** Notes adds opt-in task-completion rollover: `new_context({resume: false})` lets the reply finish, then opens fresh context without starting another turn. It stays Off by default and still requires a completed note save. Awaited same-cell saves can now precede rollover in Code and Notebook. Existing explicit model whitelists are preserved; upstream fallback whitelists use GPT-6.2 Astra/Sol and GPT-6 Luna, while this package still starts Notes inactive with an empty whitelist. Imagegen leaves image rendering to Pi to avoid duplicate images. Web Run uses Pi-native schemas. All three require conversion 5.0.1, already bundled.

**Conversion 5.1.0:** legacy `js` settings now select **VM Code**, retaining JavaScript bindings across cells for the conversation. Only one exec runs at a time. Explicit reset, session changes, termination and runtime failure drop VM bindings; the heap is not saved to disk. Use Code for fresh cells. VM Code runs under Node on Linux, macOS and Windows; Linux/Bun requires a systemd user session and cgroup v2. This package does not bypass those requirements.

The removed Deno Notebook (`notebook`) mode now selects **TS Notebook** (`ts`), also this package's fresh-install default. Old Deno state and profiles are neither imported nor deleted; see the [upstream recovery guide](https://github.com/IgorWarzocha/howaboua-pi-stuff/blob/c4f48525475f278d41dc311f2707926216bfa35b/docs/deno-to-ts-notebook.md). TS Notebook requires Node and may install its pinned compiler/runtime on first use. Its Node APIs are upstream TS behavior; VM Code's restricted tool bridge remains separate.

Voice-only mode now follows Provider scope. Extra-tools-only scope becomes Codex plus explicitly configured providers; it does not enable all providers. Standalone `apply_patch`/`view_image` switches are removed; these tools remain adapter tools subject to Pi's tool allowlist. Tool details now selects Minimal, Compact or Preview, heavy prompt overwrite becomes Off/On, and Codex uses the fixed `codex_cli_rs` originator. Global and trusted-project settings migrate once while preserving unrelated fields. Explicit provider scopes, Notes whitelists and existing plain-command-output choices remain effective.

Browser 0.0.15, imagegen 0.0.17 and Web Run 0.0.13 require conversion 5.1.0 and always use compact guidance. Browser/imagegen clarify settings labels; Web Run distinguishes searches, opens, links and finds in activity rows. Notes remains 0.0.19.

Notes 0.0.17 requires conversion 5 and adds Linux post-exit cleanup of retired session records for sessions with pruning enabled. It does not enable pruning for new sessions: they still start Off. Existing pruning-enabled sessions gain automatic physical cleanup after quitting Pi; review that retention choice before enabling pruning. No user session data is pruned during this package update.

**Voice/imagegen update:** rebuild any custom voice-helper overrides for conversion 4.0.8 or newer; bundled helpers update with the package. Imagegen still defaults to Codex access; `/imagegen` selects explicit OpenAI API access and its model/quality/complexity preferences. Select image references explicitly for edits. Upstream changelog notices now use Pi’s native `collapseChangelog` setting.

Notes history now reads local Pi session files; upstream provides read-only remote-note retrieval and saved Tree-history recovery, not the old encrypted Remote execution mode. No pruning is enabled or run by this update. Existing account/history recovery has not been live-tested. Notes uses native `better-sqlite3`; installation may need a C++ build toolchain and Node headers when a binary is unavailable.

The removed Deno Notebook's journal expiry and checkpoint-cleanup controls no longer run. Existing saved files remain available for manual recovery or cleanup; this update does not delete them.

`npm ci` applies the tracked patch in `patches/` via `patch-package`. Install scripts must be enabled. Patch failures fail installation rather than silently dropping the integration. See [patch maintenance](./patches/README.md).

Recommended defaults are **TS Notebook mode** and **Compact V2** (`executionMode:
"ts"`, `compaction.method: "v2"`). New installs need no settings changes.
Existing explicit global or trusted project preferences still take precedence;
missing settings inherit these defaults. Change them with `/codex` if desired.

- Conversion owns the Codex provider and connection lifecycle. The `/fast` extension only dispatches commands; it never installs a transport or injects request options.
- The tiny provider-neutral `/fast` extension toggles conversion's fast setting for the current model family on conversion-owned routes, without opening settings or maintaining a second preference. The patch routes this through conversion's save/apply lifecycle: trusted folder scope is preserved and busy runs apply when idle. A valid `PI_CODEX_FAST` environment override pins the setting; unset it and restart to use the toggle. Unsupported integrations warn without changing settings.
- Conversion's resolved fast state appears beside the model in our custom footer, not in the conversion status row. Conversion still controls the setting and request service tier.
- Conversion's status includes reset countdowns directly beside its quotas (e.g. `weekly: 32% left · 1d18h ↺`), using the same cached usage response and existing refresh cadence. There is no separate usage fetcher or fallback row.
- Better OpenAI is removed, including `/openai-usage`, `/openai-settings`, and `--fast`. Its old `pi-better-openai.json` files are ignored; no standalone preference is imported. Use Conversion's settings or `PI_CODEX_FAST` for startup defaults.
- Hosted `web_run` and `imagegen` tools compose as `tools.web__run` and `tools.image_gen__imagegen` inside Code/Notebook. Renamed Codex transports also use hosted search. No separate non-Codex search fallback is bundled.
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
another provider. ChatGPT sign-in alone does not authorize these hosted tools;
a separate legacy OpenAI Codex login may be needed. Companion failures now give
concise login guidance and redact raw backend details; provider routing is unchanged.

With Pi 1.0.4, Azure's provider name is `azure`; its Responses API ID remains
`azure-openai-responses`. Conversion 5.0.0 does not automatically activate for
ordinary Azure GPT model IDs under the renamed provider. If you intentionally
use conversion with Azure Responses, include `azure` in conversion's
`scope.additionalProviders`; existing `allProviders` settings and Codex-named
model detection still apply. This package does not enable additional providers
automatically.

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
| style/diff/post-edit | yes     | likely         | Mostly Node/pi behavior; external tools may vary.                        |

## External dependencies

| Extension                | Optional/required tools                                                           | Notes                                                    |
| ------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| browser                  | Node.js 22.19+, Chrome-family browser with CDP enabled; optional SSH/SCP          | Logged-in browser control, not desktop control.          |
| diff                     | Shiki npm dependencies                                                            | No major system tool expected.                           |
| post-edit                | project-configured commands                                                       | Runs whatever `.pi/post-edit.json` asks for.             |
| screenshot-picker        | macOS `defaults`, macOS `open`, Linux `xdg-open`, terminal image protocol support | Image previews need capable terminals.                   |
| sounds                   | macOS `afplay`                                                                    | Configurable sounds are macOS-targeted.                  |
| style                    | `git`, optional `gh`                                                              | GitHub PR footer segment uses GitHub CLI when available. |

# TODO

Maybe incorporate some settings management a la https://github.com/juanibiapina/pi-extension-settings
