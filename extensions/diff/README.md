# diff

Replaces pi's built-in `write` and `edit` tool rendering with syntax-highlighted diffs.

Features:

- Unified and split diff views, with automatic fallback based on terminal width
- Shiki syntax highlighting, default theme `dark-plus`
- Word-level highlights inside changed lines
- Line wrapping with higher capacity when expanded via `ctrl+o`
- Multi-edit previews with gutter ellipsis separators and expandable hidden edits
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
DIFF_BG_ADD="#162620"
DIFF_BG_DEL="#2d1919"
DIFF_BG_ADD_HL="#234b32"
DIFF_BG_DEL_HL="#502323"
DIFF_BG_GUTTER_ADD="#12201a"
DIFF_BG_GUTTER_DEL="#261616"
DIFF_FG_ADD="#64b478"
DIFF_FG_DEL="#c86464"
```

Project or global pi settings can also configure presets/colors in `.pi/settings.json`:

```json
{
  "diffTheme": "subtle",
  "diffColors": {
    "bgAdd": "#081008",
    "bgDel": "#100808",
    "bgAddHighlight": "#122818",
    "bgDelHighlight": "#281212",
    "shikiTheme": "dark-plus"
  }
}
```

Built-in presets: `default`, `midnight`, `subtle`, `neon`.
