# Conversion patch

The patch targets the shipped **dist JavaScript and declarations** of conversion
3.0.52, which its exports and our extension loader execute. Upstream `src/` is
not rebuilt at installation. Updating conversion requires reviewing and
regenerating this patch, not merely changing the version pin.

## October 13 maintenance (2026-10-13)

Updated conversion **3.0.50 → 3.0.52** and the Pi development/test baseline
**1.1.0 → 1.2.0**. Rediscovered used packages from tracked manifests, lockfiles,
imports, loaders, patches and documentation. Independently fetched registry
metadata and verified the SHA-512 integrity of all 12 baseline ecosystem packages'
latest tarballs; reviewed packaged companion changelogs and the
[tagged Pi 1.2.0 changelogs](https://github.com/earendil-works/pi/tree/v1.2.0/packages).
Browser **0.0.8**, imagegen **0.0.10** and web-run **0.0.7** remain current.
The seven remaining Pi packages (`pi-agent-core`, `pi-ai`, `pi-codemode`,
`pi-coding-agent`, `pi-mcp`, `pi-telemetry`, `pi-tui`) resolve to **1.2.0**.
Pi no longer depends on `chord`, so it and its unused esbuild tree are removed.
Conversion now requires undici 8.11.2, openai 7.32.0 and higher smol-toml,
web-tree-sitter and ws minima; only their required resolutions change.
Peer ranges stay unchanged, including coding-agent **>=1.1.0**. The active-voice
channel is not a package, and no unused ecosystem companion is added.

[Conversion 3.0.51–52](https://github.com/IgorWarzocha/howaboua-pi-stuff/blob/76f2077127752693af97098b9391f1372a557c98/packages/pi-codex-conversion/CHANGELOG.md) introduces context presets (272k/500k/872k, custom/reset),
corrects Sol's default to 500k, and adds configurable idle rollover, keepalive
intervals and task-boundary reminders. Existing enabled rollover/keepalive
settings retain their intervals. Rebased the shipped dist patch, preserving
Notebook/Compact V2 defaults, snapshots, compaction vetoes, fast/ultrafast/footer
state, quota countdowns and voice ownership/controls. Use upstream's newly
exported `resolveCodexModelFamily` instead of patching a private resolver export.

Pi 1.2 custom-message starts have no user prompt: skip only tree-handoff prompt
validation for these events while retaining the rest of lifecycle preparation.
Declare `reachesTools: () => "all"` for dynamic exec/wait cells so Pi's MCP
readiness hook can wait for connecting servers; this does not change tool
admission. The existing bridge already preserves Pi's newly widened structured
MCP results, including arrays and null. Both theme schema URLs now use pi.dev.

Validation: clean `npm ci` with strict replay of all **19 patched files**, all
**68 tests**, `npm run typecheck`, `npm ls --all` and `git diff --check` pass.
New regressions cover custom/ordinary/legacy turn starts, registered exec/wait
reachability, structured MCP values, real startup theme validation and fake-cursor
rendering on both terminal hosts. Existing integration regressions remain green.
Live MCP connection timing, authenticated provider requests, actual external
Notes Compaction, encrypted remote history, browser/audio/LAN hardware and macOS
terminal interaction remain unrun. The retained peer minimum is not a claim that
the full suite was rerun on every older Pi version. Remote checks are inspected
on the final pushed commit; this repository currently has no workflow files.

## October 11 follow-up (2026-10-11)

Updated the existing maintenance branch from conversion **3.0.49 → 3.0.50**.
Repeated discovery across tracked manifests, lockfiles, imports, loaders, patches
and documentation, and independently verified all 12 latest published ecosystem
tarballs against their registry SHA-512 integrity. Browser **0.0.8**, imagegen
**0.0.10**, web-run **0.0.7**, and all eight Pi packages at **1.1.0** remain current.
Published dependency and peer requirements are unchanged; in particular browser's
optional conversion peer remains **>=3.0.48**, regardless of unreleased metadata
on upstream main. The `@howaboua/pi/active-voice/v1` string is an event channel,
not an additional package. No Notes Compaction, Ask, Shepherdr or Sites package is
added.

The [release-pinned changelog](https://github.com/IgorWarzocha/howaboua-pi-stuff/blob/ef20cd8c21c14c84d65f586dd485388ad82fee23/packages/pi-codex-conversion/CHANGELOG.md)
matches the published artifact. The runtime delta adds an optional external notes
owner `allowsCompaction(reason)` guard before compaction work. A false result
yields to that owner's later hook, avoiding an unwanted summary when normal
compaction is disabled. The declaration and source match this behavior; remaining
artifact changes are release/API documentation and the package version.

All 17 pre-existing patched dist files are byte-identical to 3.0.49, and both
local additions remain absent upstream. The patch contents are unchanged and
renamed for 3.0.50, preserving every customization from the October 10 rebase.
Only conversion's root pin and resolved lock entry change in this follow-up.

Validation: clean `npm ci` with strict patch replay, all **63 tests**, typecheck,
`npm ls`, and `git diff --check` pass. The new lifecycle regression fails against
3.0.49 and passes against 3.0.50. It covers vetoes for manual, threshold and
overflow reasons before turn, notebook, voice or provider work; permissive and
legacy owners; and existing tree-handoff cancellation without an external owner.
Live provider requests, actual external Notes Compaction integration, encrypted
remote history, browser/audio/LAN hardware and macOS terminal interaction remain
unrun. No CI check runs or statuses were attached to the prior PR head; remote
checks are rechecked after pushing the final commit.

## October 10 maintenance (2026-10-10)

Discovered the used ecosystem from manifests, the lockfile, imports, loaders,
patches and tracking documentation. Independently fetched current registry
metadata and verified all 12 latest package tarballs against their published
SHA-512 integrity. Reviewed the packaged companion changelogs and
[tagged Pi changelogs](https://github.com/earendil-works/pi/tree/v1.1.0/packages).

- Conversion: **3.0.47 → 3.0.49**.
- Browser: **0.0.7 → 0.0.8**.
- Imagegen **0.0.10**, web-run **0.0.7**, and all eight used Pi packages remain
  current: `chord`, `pi-agent-core`, `pi-ai`, `pi-codemode`, `pi-coding-agent`,
  `pi-mcp`, `pi-telemetry`, `pi-tui` at **1.1.0**.
- Raise only the coding-agent peer minimum to **>=1.1.0**, matching conversion's
  published requirement. AI and TUI remain **>=1.0.0**. Browser's optional
  conversion peer now requires **>=3.0.48**, satisfied by the bundled version.
  Keep unrelated dependency resolutions and the Node 22.19+ host floor unchanged.

[Conversion 3.0.48–49](https://github.com/IgorWarzocha/howaboua-pi-stuff/blob/main/packages/pi-codex-conversion/CHANGELOG.md)
adds Ultrafast/Daybreak, audio-device selection, voice session handoff, external
notes support and the Remote-to-Notes shared-context fix. Nine of the 17 existing
patched dist files changed upstream; eight were byte-identical and both local
additions remain absent upstream. Rebased and regenerated all 19 patched files,
preserving Notebook/Compact V2 defaults, snapshots, quota countdowns, Option
shortcut labels, settings scope and idle deferral.

The custom footer displays `fast` or `ultrafast` using upstream's resolved service
tier. `/fast` turns either enabled tier off and turns an off family on as ordinary
Fast; other families and Daybreak stay unchanged. `PI_CODEX_FAST=ultrafast` blocks
the toggle just like boolean overrides. Conversion retains Daybreak and base-cost
estimate status without duplicating the speed badge. Voice controls retain
upstream ownership checks and notify on handoff reservation, transfer, stop and
completion; a forwarded call can still be stopped from the source session.

[Browser 0.0.8](https://github.com/IgorWarzocha/howaboua-pi-stuff/blob/main/packages/pi-browser/CHANGELOG.md)
returns help for empty calls and foregrounds screenshot targets to avoid focus
emulation timeouts. Invalid requests now fail during argument preparation; the
regression test covers that earlier rejection. No Sites assets or tools are
configured here, so the newly separated Sites package is not added.

Validation: clean `npm ci` with strict patch replay, all 60 tests,
`npm run typecheck`, and `git diff --check`. New tests cover Ultrafast persistence,
footer state, Daybreak/cost status, browser and notebook help, foreground capture
ordering, voice handoff/ownership, and external notes sharing while retaining
saved Remote identity. Existing snapshot, native patch execution, loader, MCP,
compaction-default, quota, editor and lifecycle tests remain in place.
Authenticated provider/Daybreak/Ultrafast requests, encrypted remote history,
real browser capture, audio hardware/LAN transfer and macOS terminal interaction
are not exercised by this automated run.

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
`npm pack @howaboua/pi-codex-conversion@3.0.52` to obtain a pristine registry
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
