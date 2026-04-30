# screenshot-picker

A pi coding agent extension for quickly selecting and attaching screenshots to your prompts. Works on **macOS** and **Linux**. Browse recent images with thumbnail previews, stage multiple images, then type your message — staged screenshots attach automatically when you send.

## Why

Attaching screenshots during development is tedious. You're constantly:

- Dragging files from Desktop/Finder
- Losing track of which screenshot is which
- Breaking your flow to find the right image

screenshot-picker gives you a visual screenshot browser right in your terminal:

```text
/ss
```

## Install

This package includes the extension under `extensions/screenshot-picker`. Use `/ss` after installing/loading this pi package.

## Quick Start

1. Press `Ctrl+Shift+S` or type `/ss` to open the picker.
2. Navigate with `↑↓`, press `s` or `space` to stage/unstage screenshots (`✓` appears).
3. Press `Enter` to close the picker and keep staged screenshots.
4. Type your message in the prompt.
5. Press `Enter` to send — staged images attach automatically and the staged widget clears.

Use `Esc` to cancel and clear staged screenshots without sending.

## Commands and shortcuts

### `/ss`

Pick screenshots to attach to the next message.

**Keys:**

- **↑↓** - Navigate through screenshots
- **Ctrl+T** - Cycle through source tabs, when multiple sources are configured/found
- **z** - Toggle zoom inspector mode
- **+ / -** - Zoom in/out in inspector mode
- **←↑→↓** - Pan image in inspector mode when supported; otherwise arrows navigate
- **[ / ]** - Previous/next screenshot in inspector mode
- **0** - Reset inspector zoom and pan
- **s / space** - Stage/unstage current screenshot
- **x** - Clear all staged screenshots
- **o** - Open current screenshot in the system image viewer
- **Enter** - Close picker and keep staged screenshots
- **Esc** - Cancel and clear staged screenshots

### `/ss-clear`

Clear all staged screenshots without sending.

### `Ctrl+Shift+S`

Keyboard shortcut to open the picker.

### `Ctrl+Shift+X`

Keyboard shortcut to clear all staged screenshots.

## Features

- **Multiple sources with tabs** - Configure multiple directories/patterns, switch with `Ctrl+T`
- **Glob pattern support** - Use patterns like `**/*.png` to match files flexibly
- **Thumbnail previews** - See what you're selecting in terminals with image support
- **Zoom inspector mode** - Press `z`, then pan with arrows and zoom with `+`/`-`
- **Multi-select** - Stage multiple screenshots, then attach them all on send
- **Relative timestamps and file sizes** - Know what you're attaching
- **Staged indicator** - Widget shows `📷 N screenshots staged` below the editor
- **Auto-detection** - Finds common screenshot folders when no config is present

## Configuration

By default, the extension auto-detects screenshot locations based on your platform. To override that, configure sources in `~/.pi/agent/settings.json`:

```json
{
  "piPackage": {
    "screenshotPicker": {
      "sources": [
        "~/Pictures/Screenshots",
      "~/Pictures/Screenshots",
        "/path/to/comfyui/output/**/thumbnail_*.png"
      ]
    }
  }
}
```

Each source becomes a tab in the picker UI. Duplicate source paths are deduped, including case-only duplicates on macOS.

### Source types

**Plain directories** - Non-recursively scans for common image files:

```json
"~/Pictures/Screenshots"
```

Supported extensions: `.png`, `.jpg`, `.jpeg`, `.webp`.

**Glob patterns** - Matches image files matching the pattern:

```json
"/path/to/images/**/*.png"
"/mnt/Store/ComfyUI/Output/**/thumbnail_*.png"
```

Glob patterns support common `glob` syntax such as `*`, `**`, `?`, and character classes like `[abc]`.

### Default locations when no config is present

**macOS:**

1. System screenshot location from `defaults read com.apple.screencapture location`
2. `~/screenshots`
3. `~/Screenshots`
4. `~/Desktop`
5. `~/Pictures/Screenshots`

**Linux:**

1. `~/Pictures/Screenshots`
2. `~/Pictures`
3. `~/Screenshots`
4. `~/Desktop`

Only existing locations are used.

## Remote Development

When developing on a remote machine via SSH, use an external sync/mount tool to make local screenshots available on the remote.

### Option 1: SSHFS

```bash
# macOS: brew install macfuse sshfs
# Linux: sudo apt install sshfs
mkdir -p ~/remote-screenshots
sshfs user@remote:~/Screenshots ~/remote-screenshots
```

Configure macOS to save screenshots there:

```bash
defaults write com.apple.screencapture location ~/remote-screenshots
killall SystemUIServer
```

On the remote, configure the extension to read from the synced/mounted folder:

```json
{
  "piPackage": {
    "screenshotPicker": { "sources": ["~/Screenshots"] }
  }
}
```

### Option 2: Syncthing

[Syncthing](https://syncthing.net/) provides continuous, bidirectional file sync. Install it on both machines, share your local screenshot folder with the remote, then configure `sources` to point at the synced folder.

### Thumbnail previews over SSH

To enable thumbnail previews over SSH, expose your terminal capability to the remote shell, for example:

```bash
export TERM_PROGRAM=ghostty  # or: kitty, WezTerm, iTerm.app
```

Restart pi after changing the shell profile.

## Requirements

- macOS or Linux
- Terminal with image support for thumbnails, such as Kitty, iTerm2, Ghostty, or WezTerm
  - Unsupported terminals fall back gracefully

## License

Private personal package.
