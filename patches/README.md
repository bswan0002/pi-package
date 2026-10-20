# Conversion patch

The patch targets the shipped **dist JavaScript and declarations** of conversion
4.0.2, which its exports and our extension loader execute. Upstream `src/` is
not rebuilt at installation. Updating conversion requires reviewing and
regenerating this patch, not merely changing the version pin.

## Conversion 4.0.2 and companions (2026-10-19)

Updates the existing PR from conversion **4.0.1 → 4.0.2**, browser **0.0.8 → 0.0.9**,
imagegen **0.0.10 → 0.0.11**, and web-run **0.0.7 → 0.0.8**. Fresh discovery covered
both main and PR manifests, complete lockfiles, imports/loaders, extensions, patches
and tracking documents; all 11 latest ecosystem tarballs passed SHA-512 verification.
All seven Pi packages remain **1.3.0**. The three companions declare optional
conversion peers **>=4.0.2**, satisfied together here. Root peer ranges are unchanged.
Imagegen/web-run now require undici **8.12.2**; retain the other existing transitive
resolutions, including certificate libraries npm otherwise refreshed unnecessarily.

Reviewed the [release-pinned package changelogs](https://github.com/IgorWarzocha/howaboua-pi-stuff/tree/37406c5b663252cba486c9032c8cd128ce13ec0a/packages).
Three existing patch targets changed (configuration defaults, Code tools and
settings commands), 13 were unchanged and two remain local additions. Regenerated
the same 18-file patch, preserving Notebook/Compact V2, snapshots, compaction vetoes,
fast/ultrafast/footer, quota countdowns, conservative MCP readiness and voice controls.
PCC GPT prompt mode remains opt-in; ordinary prompt settings retain their meaning.
New companion guidance and unified help discovery remain upstream-owned.

**Current runtime and retention behavior:** Code mode always uses the pinned official
runtime, and downloads honor proxy environment settings. `tools.customRustBinariesDir`
no longer overrides Code mode; other native helper overrides are unchanged. This
supersedes the local Code build guidance in the historical 4.0.1 entry below.
Notebook journals default to expiry after seven days without updates. `/codex`
offers **On** (no age expiry, ordinary size limits remain), **Keep for 1 week**, or
**Off & remove** (stop recording and remove journals). Saved variables and conversations
are separate. Session-checkpoint cleanup is independently opt-in at one month or one
week; the default remains **Never**. No user data cleanup was run by this maintenance.

For existing pre-4.x sessions, install the updated package first, run `/reload` in
the still-running session, complete one turn, and only then restart Pi. The reasoning
and upstream source for this sequence are recorded in the 4.0.1 assessment below;
the reload must load the newly installed version, not the old package.

Validation: clean `npm ci` with strict patch replay, all **72 tests**, typecheck,
`npm ls --all`, and `git diff --check` pass. New tests exercise compact/ordinary
companion guidance in both load orders without changing schemas, browser's on-demand
help, journal expiry with a recent sidecar, indefinite/off policies, and default
checkpoint retention using disposable fixtures. The first new prompt test assumed
browser changed its description; inspection showed it changes help output instead,
and the test now exercises that actual contract. Existing 70 tests stayed green.
Live provider calls, official runtime download/execution and proxy behavior, actual
persisted-session migration, MCP connection timing, browser capture, audio/LAN hardware
and macOS interaction remain unrun. Remote checks are inspected on the pushed head.

## Conversion 4.0.1 compatibility (2026-10-16)

Updated conversion **3.0.52 → 4.0.1** after rediscovering packages from tracked
manifests, the complete lockfile, imports, loaders, patches and documentation.
Independently verified published metadata and SHA-512 integrity for all 11 used
ecosystem tarballs. All seven Pi packages stay at **1.3.0**, browser at **0.0.8**,
imagegen at **0.0.10**, and web-run at **0.0.7**. No unused package is added.
Raise only AI and coding-agent peer minima to **>=1.3.0**, matching conversion's
published requirements; TUI stays **>=1.0.0**. Required transitive changes are
openai **7.34.0** and conversion's undici **8.12.2**; other resolutions are unchanged.

The [release-pinned changelog](https://github.com/IgorWarzocha/howaboua-pi-stuff/blob/187a70d621ccc99b119166e55fcd568e5b4f605e/packages/pi-codex-conversion/CHANGELOG.md)
introduces Pi-native custom-turn preparation, new-window request policy, native
deferred-tool admission, sequential Code/Notebook execution and fixes for resume,
no-argument calls, cancellation, exit and late command output. Removed prepared-idle
kickoff APIs are not used by local extensions. Upstream voice setup now admits a
custom turn and uses `sendMessage(..., { triggerTurn: true })`; preserve that path.

Five existing patch targets changed upstream, 12 were identical, and two were
local additions. Regenerated **18 patched files**, dropping the custom-message
handoff guard because upstream now checks `messageType === "user"` on the required
Pi 1.3 event contract. Tests verify custom starts still prepare the session/turn
without interrupting a handoff, and user starts still validate it.
Keep conservative `reachesTools: () => "all"` on exec and wait: upstream's token
matching handles literal tool names but is not equivalent for computed names or
further calls from resumed cells. This preserves readiness without changing tool
admission. Retain upstream sequential execution and active integration tool
admission for resume, while its loadout bridge hides provider-facing declarations.
Notebook/Compact V2 defaults, snapshots, compaction vetoes, fast/ultrafast/footer
state, quota countdowns and voice controls remain intact.

**Existing-session migration:** first install this updated package (conversion
4.0.1), then run `/reload` in the existing Pi session, complete one turn, and only
then restart Pi. Do not run the migration reload before installing the update.
Pi 1.3 `AgentSession.reload()` rebuilds with `includeAllExtensionTools: true`;
conversion's `reconcileExtensionToolProjection()` now keeps those integration tools
active, and the next run records tool declarations while hiding them only in the
provider projection. Merely installing the package does not update the running
session or persist its corrected loadout. This sequence follows the packaged
4.0.1 changelog and the shipped implementations; live persisted-session migration
has not been exercised here. Local Code runtime builds must explicitly set
`tools.customRustBinariesDir`; upstream downloads Codex 0.163 otherwise.

Validation: clean `npm ci` with strict patch replay, all **70 tests**, typecheck,
`npm ls --all`, and `git diff --check` pass. Initial failures exposed outdated
fixtures for loadout metadata, custom-turn activation and prewarm suspension;
these were updated to the published contracts without weakening compaction vetoes.
New coverage checks no-argument/null normalization and deferred admission; extended
loader coverage checks persisted tool eligibility, computed-name readiness and
sequential execution. Live provider calls, Rust runtime download/execution and
cancellation, actual persisted-session migration, MCP connection timing, browser,
audio/LAN hardware and macOS interaction remain unrun. No workflow files are
configured; remote checks are inspected on the final pushed commit.

## Pi 1.3.0 compatibility (2026-10-15)

Refreshed discovery across manifests, all 252 lockfile entries, loaders, imports,
extensions, patches and tracking documents. Independently verified registry
metadata and SHA-512 integrity for all 11 used ecosystem package tarballs.
The seven Pi packages (`pi-agent-core`, `pi-ai`, `pi-codemode`, `pi-coding-agent`,
`pi-mcp`, `pi-telemetry`, `pi-tui`) advance **1.2.0 → 1.3.0**. Conversion **3.0.52**,
browser **0.0.8**, imagegen **0.0.10** and web-run **0.0.7** remain latest.
No package is added or removed. Pi's internal dependency edges now use exact
release versions upstream; the lockfile changes only these seven packages and
root development pins. Existing peer ranges and the Node host floor remain unchanged.
The active-voice event channel is not an additional package.

Reviewed the [tagged release changelogs](https://github.com/earendil-works/pi/tree/v1.3.0/packages).
Pi removes experimental assistant-frame APIs and changes worker-backed codemode
results/close to settle before actual worker exit. Neither local extensions nor
bundled companions reference those removed APIs or directly manage Pi codemode
workers, so no local adaptation is needed. Upstream now restores active tools on
resume, rejects malformed final tool arguments, fixes Sol's context window to
500k, preserves GPT-6 API-key thinking-change caches, and fixes overlay ownership.
Kimi Coding base-URL overrides now need `/v1`; this repository configures none.
No provider/account configuration is changed.

The conversion artifact and its 19-file patch are unchanged. Notebook/Compact V2
defaults, compaction vetoes, snapshots, fast/ultrafast/footer state, quota countdowns,
voice controls, and Pi 1.2 event/MCP compatibility remain covered by existing tests.
Clean `npm ci` with strict patch replay, all **68 tests**, `npm run typecheck`,
`npm ls --all`, and `git diff --check` pass on Pi 1.3.0.
Live provider requests, persisted real-session resume, Bun worker termination,
MCP connection timing, browser/audio/LAN hardware and macOS terminal interaction
remain unrun. Older supported Pi versions were not rerun. No workflow files are
configured in this repository; remote checks are verified on the pushed commit.

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
`npm pack @howaboua/pi-codex-conversion@4.0.2` to obtain a pristine registry
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
