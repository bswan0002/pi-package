# Conversion patch

The patch targets the shipped **dist JavaScript and declarations** of conversion
3.0.42, which its exports and our extension loader execute. Upstream `src/` is
not rebuilt at installation. Updating conversion requires reviewing and
regenerating this patch, not merely changing the version pin.

The 3.0.42 refresh preserves the existing patch behavior and upstream MCP
namespace guidance/recovery fixes. Development checks use Pi 1.0.0; the existing
`>=0.99.2` peer ranges still admit both versions. Pi 1.0.0 defaults to fullscreen;
this package leaves that choice to the host (`--tui-mode regular` restores normal
scrollback).

Recommended defaults, display integration, and a fast-mode toggle:

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
  persisted `openai.fast` preference through the existing save/apply path, retaining
  trusted folder scope, idle deferral, transport resets, and footer synchronization.
  A valid `PI_CODEX_FAST` override blocks the toggle with an explicit warning.

`npm ci` runs `patch-package --error-on-fail`. To regenerate after editing the
installed dependency, normally run:

```sh
npx patch-package @howaboua/pi-codex-conversion
```

If npm's remote-tarball policy blocks patch-package's temporary install, use
`npm pack @howaboua/pi-codex-conversion@3.0.42` to obtain a pristine registry
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
