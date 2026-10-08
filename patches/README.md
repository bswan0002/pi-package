# Conversion patch

The patch targets the shipped **dist JavaScript and declarations** of conversion
3.0.47, which its exports and our extension loader execute. Upstream `src/` is
not rebuilt at installation. Updating conversion requires reviewing and
regenerating this patch, not merely changing the version pin.

The 3.0.47 patch was replayed against the published package: all 17 existing
patched files are byte-identical to 3.0.46, and the two local additions remain
absent upstream. Clean installation applies the unchanged patch successfully.

The 3.0.47 refresh preserves all existing patches, including the dictation
and realtime Voice chat buttons, diff snapshots, and fast-mode integration.
Upstream fixes Local/Tree history reserved namespaces, preserves native Pi
reasoning constraints, and requires fresh notes before idle rollover.
Upstream automatic Pi tool imports prefer explicit registrations; existing tool
gates and blocking question behavior remain authoritative. The refresh also
preserves upstream notes/history attachment and the new `notesTreeHandoff` default.
Conversion and the hosted companions require Pi 1.0.0+, matching this package's
peer ranges and development checks on Pi 1.1.0. Pi 1.0.0 defaults to fullscreen;
this package leaves that choice to the host (`--tui-mode regular` restores normal
scrollback).

## Pi 1.1.0 compatibility (2026-10-08)

Reviewed the published manifests and [tagged Pi changelogs](https://github.com/earendil-works/pi/tree/v1.1.0/packages). All eight used Pi
packages (`chord`, `pi-agent-core`, `pi-ai`, `pi-codemode`, `pi-coding-agent`,
`pi-mcp`, `pi-telemetry`, `pi-tui`) resolve to 1.1.0. Conversion 3.0.47,
browser 0.0.7, imagegen 0.0.10, and web-run 0.0.7 remain the latest published
versions. The Node 22.19+ floor and Pi >=1.0.0 peer ranges are unchanged.

Pi now requires `AssistantMessageEventStream` from provider streams. Conversion
already uses its factory for the Codex transport, Responses proxy, and context
namespace router. Regression tests exercise transport errors/cancellation and
preserve recorded response duration through namespace routing. No conversion
patch changes are required.

The custom edit/write renderers are checked through Pi's actual tool component
with changing `outputPad`, recorded `durationMs`, expansion, and result replay.
Terminal test doubles implement the new `setProgramStatus` contract. Existing
loader, MCP bridge, fast-mode, voice, snapshot, editor, and lifecycle tests remain
in place. Pi's retry fixes, `agent_settled.aborted`, codemode output delimiters,
and MCP cancellation are host behavior and require no local override. The
unreleased theme-schema change is not part of this upgrade.

Validation: clean `npm ci` replays the existing conversion patch; all 53 tests,
`npm run typecheck`, and `git diff --check` pass. Live authenticated provider,
MCP OAuth, browser, and macOS terminal checks are not part of this automated run.

## Preserved customizations

Recommended defaults, display integration, and a fast-mode toggle:

- Display background-shell Alt shortcuts as Option (`⌥`) on macOS, including
  customized bindings. Other platforms and registered bindings stay unchanged.

- A right-aligned dictation button above the editor replaces dictation's footer
  status. It uses the Nerd Font microphone (`U+F130`), so configure a Nerd Font
  in your terminal. Connecting, listening/stop, and transcribing states follow
  the voice controller (including hotkeys); transition clicks are ignored.
  A Nerd Font waveform (`U+F147D`) Voice chat button sits beside Dictate and
  toggles the existing realtime conversation, becoming Stop chat while active.
  Realtime voice retains its footer status. The modes disable one another,
  and both buttons ignore clicks during connecting/reconnecting or a pending
  start/stop action. Hotkey and controller transitions update both controls.
  Clicks require Pi's fullscreen mode and do not request editor focus. Regular
  mode still displays state and retains the existing dictation hotkey.

- Default to Notebook execution and Compact V2 in conversion's config contract.
  Normalization and fresh installs inherit these choices; explicit global and
  trusted folder settings remain authoritative. Other defaults stay upstream.

- Capture bounded before/after file snapshots inside the existing patch mutation
  queue, including failed executions, and carry them through the display broker.
  They live in persisted display entries, not tool result details or model-facing
  output. Capture failures never replace execution results/errors. Paths that
  conversion's existing JS touched-path parser cannot identify fall back to the
  submitted patch; Rust remains authoritative for execution.
- Publish resolved fast-mode state on `pi-package:codex-fast-state` during adapter
  synchronization and omit the duplicate fast label from conversion's status.
  The bundled loader bridges this event into the custom footer's existing state
  store. Settings, environment overrides and request service tier stay upstream.
- Add an internal `/codex fast` command used by `/fast`. It toggles conversion's
  persisted `openai.fast` preference for the current model family through the
  existing save/apply path, retaining trusted folder scope, idle deferral, transport
  resets, and footer synchronization.
  The toggle and footer reuse upstream family resolution (including `gpt-reserve`
  as Luna); other families retain their saved choices. The patch exports the
  internal family resolver with a matching declaration rather than duplicating it.
  Legacy boolean settings migrate through upstream normalization.
  A valid `PI_CODEX_FAST` override blocks the toggle with an explicit warning.
- Carry each known quota window's reset timestamp through Conversion's usage
  status and display compact countdowns next to its percentages. Duration, not
  primary/secondary position, identifies 5h and weekly windows. Unknown windows
  are not guessed. Reset timestamps accept seconds/milliseconds and relative
  reset durations. Countdown text updates on normal status renders; no extra
  polling or timer is introduced. The same cached response supplies both values.

`npm ci` runs `patch-package --error-on-fail`. To regenerate after editing the
installed dependency, normally run:

```sh
npx patch-package @howaboua/pi-codex-conversion
```

If npm's remote-tarball policy blocks patch-package's temporary install, use
`npm pack @howaboua/pi-codex-conversion@3.0.47` to obtain a pristine registry
package and generate a `git diff --no-index` against the changed files, with
`a/node_modules/...` and `b/node_modules/...` paths. Do not relax the policy.

Verify from a clean `npm ci`, then run `npm test`, `npm run typecheck`, and
`git diff --check`. Tests execute conversion's native patch tool and real broker,
then render persisted snapshots at narrow/wide widths. They also check that
execution result details and post-edit behavior remain unchanged.

For visual verification, remove the separate conversion installation from Pi's
enabled configuration, restart Pi with this package, and ask for edits to the
untracked `diff-preview-demo.ts` using Structured and Code/Notebook modes. Check
token colors on added/removed lines, expansion, resizing, and the model-adjacent
fast label while toggling `/fast` and `/codex openai`. Automated ANSI assertions do not
replace this terminal check. Keep the disposable demo out of commits.
