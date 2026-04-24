# Spec: bswan0002 screenshot-picker pi extension

## Purpose

Build a personal pi extension for quickly browsing recent screenshots, staging one or more images, and automatically attaching staged images to the next user message.

The extension should be inspired by the UI/flow in `Graffioh/pi-screenshots-picker`, reviewed locally at `/tmp/pi-screenshot-picker.MUz11o/repo`, but implemented as our own simpler, safer version.

## Name and namespacing

- Extension/package feature name: `screenshot-picker`.
- Follow the existing bswan0002 namespacing pattern for user-facing identifiers.
- Primary command: `/bswan0002-screenshot-picker`
  - User workflow: type `/scr` then tab-complete to this command.
- Settings key: `bswan0002-screenshot-picker`.
- Widget/status IDs and any event names should be namespaced, e.g.:
  - widget id: `bswan0002:screenshot-picker:staged`
  - event names, if any: `bswan0002:screenshot-picker:*`
- Suggested extension path in this repo: `extensions/screenshot-picker/index.ts`.

## User workflow

1. User runs `/bswan0002-screenshot-picker`.
2. A TUI picker opens showing screenshots sorted newest first.
3. User navigates screenshots, sees an inline preview, and toggles staged selections.
4. User presses `Enter` to accept/close.
5. A small widget indicates how many screenshots are staged.
6. User types a normal prompt.
7. On submit, the extension attaches all staged images to that user message and clears the staged set/widget.

## Source repository notes

The reference extension (`Graffioh/pi-screenshots-picker`) has useful ideas:

- Custom `ctx.ui.custom()` picker.
- Split list + preview UI.
- Multi-source tabs.
- Staged image widget.
- Input-event transform to attach staged images.
- Inline previews using `@mariozechner/pi-tui` `Image`.

Issues/changes desired for our version:

- The reference default detection misses lowercase `~/screenshots`.
- It reads only global `~/.pi/agent/settings.json`, not project settings.
- It has too many shortcuts and destructive operations.
- `Esc` should cancel picker changes and remove staged selections instead of leaving newly staged screenshots around.
- No delete-from-disk and no nuke-all behavior.

## Configuration

Read configuration from pi settings under:

```json
{
  "bswan0002-screenshot-picker": {
    "sources": ["~/screenshots"]
  }
}
```

Requirements:

- Support `sources?: string[]`.
- Source entries can be plain directories or glob patterns.
- Do not support or require an environment variable.
- Prefer using pi-supported settings APIs if available; otherwise read settings JSON directly.
- If reading JSON directly, support both:
  - global: `~/.pi/agent/settings.json`
  - project: `.pi/settings.json`
- Project settings should override/augment global settings in a predictable way:
  - If project `sources` exists and is non-empty, use it.
  - Else use global `sources`.
  - Else use default discovery.

## Default source discovery

Primary platform is macOS, but Linux should be reasonable.

If no configured sources:

### macOS

Use this priority order, deduping paths and only keeping existing directories:

1. macOS screencapture preference: `defaults read com.apple.screencapture location`
   - Important: expand `~` if the preference returns a tilde path.
2. `~/screenshots`
3. `~/Screenshots`
4. `~/Desktop`
5. `~/Pictures/Screenshots`
6. `~/Pictures`

### Linux / other Unix

Use this priority order, deduping paths and only keeping existing directories:

1. `~/screenshots`
2. `~/Screenshots`
3. `~/Pictures/Screenshots`
4. `~/Pictures`
5. `~/Desktop`

If no default directory exists, notify the user with a clear warning and suggest configuring `bswan0002-screenshot-picker.sources`.

## Source scanning

- Sort all results newest first by mtime.
- For plain directory sources:
  - Non-recursive scan for now.
  - Include common image extensions: `.png`, `.jpg`, `.jpeg`, `.webp`.
  - Do **not** restrict to screenshot-looking filenames. The user's screenshot directory is trusted as the filter.
- For glob sources:
  - Support common glob patterns (`*`, `**`, etc.) if implementing glob support is easy.
  - Include only image extensions: `.png`, `.jpg`, `.jpeg`, `.webp`.
- Deduplicate files by resolved absolute path.
- Ignore unreadable/stat-failing files.

Dependency guidance:

- Prefer no extra dependency if simple directory scanning is enough.
- If glob support is implemented, using `glob` is acceptable but add it to `package.json` dependencies.

## Staging model and cancel semantics

Maintain staged screenshots as paths plus image payloads.

Important behavior:

- Staged selections persist after accepting the picker with `Enter` until the next user message sends.
- When the user opens the picker and there are already staged screenshots, those items should appear selected.
- Pressing `Enter` keeps the current picker selection and closes.
- Pressing `Esc` cancels the picker and removes staged selections.
  - Simple rule requested by user: “esc cancels and removes.”
  - If there were staged images before opening and the user wants to keep them, they should press `Enter`.
  - On `Esc`, clear staged paths/images and clear the staged widget.
- After staged images attach to a user message, clear staged state and widget.

No expiration is required beyond “clear after the next send” and “clear on Esc/cancel”.

## Commands and shortcuts

Required command:

- `/bswan0002-screenshot-picker`
  - Description: “Pick screenshots to attach to the next message.”

No global keyboard shortcut is required unless added later.

Optional command if useful:

- `/bswan0002-screenshot-picker-clear`
  - Clears staged screenshots.
  - Not required by the user, but acceptable if implemented and namespaced.

## Picker UI

Preferred UI:

- Split view when terminal is wide enough:
  - left: screenshot list
  - right: preview of selected screenshot
- Responsive fallback for narrow terminals:
  - preview above list or list below preview is acceptable.
  - If responsive layout is too much for first pass, keep split view with sane truncation.
- Multiple configured/default sources should be shown as tabs or source labels.
- Inline preview is important; user primarily uses Ghostty.
- Graceful fallback if inline image rendering fails or terminal image support is unavailable:
  - show filename, dimensions if available, size, and a message that preview is unavailable.

The UI should keep every rendered line within the provided `render(width)` width. Use ANSI-width-safe helpers such as `visibleWidth`, `truncateToWidth`, or similar.

### Display content

For each screenshot list row show compact metadata:

- cursor marker
- staged marker
- relative age or time
- file size
- truncated filename if useful

Sort newest first only. No filtering/search required for first version.

Footer/help text should be concise and show current bindings.

## Picker keybindings

Use this simplified key set:

- `↑` / `↓`: navigate screenshots.
- `Space`: toggle staged state for current screenshot.
- `Enter`: accept/close, preserving current staged selection.
- `Esc`: cancel and clear staged screenshots.
- `Tab`: next source/tab, if multiple sources are available.
- `o`: open current screenshot in the system image viewer.
- Optional, only if useful: `Shift+Tab` for previous source.

Do not implement:

- delete from disk
- nuke all
- complicated zoom inspector
- `s` staging shortcut unless there is a strong reason; `Space` is enough
- `x` clear-all inside picker unless later requested

## Open in system viewer

For `o`:

- macOS: `open <path>` via `pi.exec` or safe child process args.
- Linux: `xdg-open <path>` if available.
- Errors should be non-fatal; notify if opening fails.
- Avoid shell interpolation; pass args safely if possible.

## Image attachment

Use pi input transform behavior:

- Listen for `input` events.
- If no staged images, continue unchanged.
- If staged images exist:
  - Load images as base64 as late as practical, ideally at send time from staged paths. This avoids keeping large base64 strings around and reflects file changes.
  - Build `ImageContent` entries with correct MIME type.
  - Append to `event.images`.
  - Return `action: "transform"` with original text and merged images.
  - Clear staged state and widget.

MIME type mapping:

- `.png` → `image/png`
- `.jpg` / `.jpeg` → `image/jpeg`
- `.webp` → `image/webp`

If a staged file can no longer be read when sending:

- Skip that file.
- Notify the user if UI is available.
- If all staged files fail, continue with no image attachments rather than crashing.

## Safety / non-goals

- Do not delete screenshots from disk.
- Do not implement nuke/delete-all.
- Do not mutate files.
- Do not add image resizing/compression in first pass.
- Do not add max file count/size limits in first pass unless needed to prevent obvious failures.

## Implementation notes

- Import types from `@mariozechner/pi-coding-agent` and TUI pieces from `@mariozechner/pi-tui`.
- Use `ctx.ui.custom()` for the picker.
- Use `ctx.ui.setWidget()` below the editor for staged count.
- Use `Image` from `@mariozechner/pi-tui` for previews.
- Cache preview base64 data while the picker is open to avoid re-reading files on every render.
- Keep attachment state outside the picker function so it persists after closing with `Enter`.
- Keep picker-local draft selection as a `Set<string>` and only commit to global staged paths on `Enter`.
  - On `Esc`, clear global staged paths/images/widget per requested semantics.
- Consider storing only paths globally and loading base64 on send.

## Testing / validation

Manual checks:

1. With screenshots in `~/screenshots`, run `/bswan0002-screenshot-picker`; the directory should be found.
2. Navigate newest-first list with arrow keys.
3. Preview selected screenshot in Ghostty.
4. Toggle one screenshot with `Space`, press `Enter`, verify staged widget appears.
5. Send a prompt; verify screenshot attaches and widget clears.
6. Stage screenshots, reopen picker, verify already staged screenshots appear selected.
7. Press `Esc`; verify staged selections/widget are cleared and no images attach to next prompt.
8. Configure multiple sources in settings and verify `Tab` cycles sources.
9. Press `o` and verify the selected screenshot opens in Preview.app on macOS.
10. Test no-screenshot/no-source case gives a useful notification.

Automated/basic checks:

- Run `npm run typecheck`.
- If adding dependencies, update `package.json` and lockfile appropriately.

## Reference files/docs read during spec creation

- Pi extension docs: `docs/extensions.md`
- Pi TUI docs: `docs/tui.md`
- Pi keybindings docs: `docs/keybindings.md`
- Reference repo source: `/tmp/pi-screenshot-picker.MUz11o/repo/index.ts`
- Reference repo README: `/tmp/pi-screenshot-picker.MUz11o/repo/README.md`
