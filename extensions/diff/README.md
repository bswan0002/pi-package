# diff

Replaces pi's built-in `write` and `edit` tool rendering with syntax-highlighted diffs.

Based on and attributed to [buddingnewinsights/pi-diff](https://github.com/buddingnewinsights/pi-diff).

Features:

- Unified and split diff views, with automatic fallback based on terminal width
- Shiki syntax highlighting, default theme `dark-plus`
- Word-level highlights inside changed lines
- Line wrapping with higher capacity when expanded via `ctrl+o`
- Multi-edit previews with compact ellipsis separators and expandable hidden edits
- Full neutral diff-block background with non-dimmed context lines
- GitHub-style blue hunk separators and compact line-number cells
- Theme-aware add/remove colors, with optional overrides

## Configuration

Environment variables:

```bash
# Shiki theme
DIFF_THEME=dark-plus

# Wrapping limits
DIFF_WRAP_ROWS=8
DIFF_WRAP_ROWS_NARROW=4
DIFF_WRAP_ROWS_MED=6
DIFF_WRAP_ROWS_WIDE=8

# Optional color overrides, hex #RRGGBB
DIFF_BG_BASE="#303030"
DIFF_BG_ADD="#263a31"
DIFF_BG_DEL="#462b2b"
DIFF_BG_ADD_HL="#2d5a41"
DIFF_BG_DEL_HL="#643434"
DIFF_BG_GUTTER_ADD="#263f33"
DIFF_BG_GUTTER_DEL="#482f2f"
DIFF_BG_HUNK="#1f314e"
DIFF_FG_ADD="#64c882"
DIFF_FG_DEL="#eb6e6e"
```

Global `~/.pi/agent/settings.json` or project `.pi/settings.json` can configure presets/colors:

```json
{
  "piPackage": {
    "diff": {
      "theme": "subtle",
      "colors": {
        "bgAdd": "#223027",
        "bgDel": "#342424",
        "bgAddHighlight": "#294f38",
        "bgDelHighlight": "#543030",
        "bgBase": "#303030",
        "bgHunk": "#1f314e",
        "shikiTheme": "dark-plus"
      }
    }
  }
}
```

Built-in presets: `default`, `midnight`, `subtle`, `neon`.
