# better-openai

OpenAI/Codex quality-of-life extension for pi.

Ported from and attributed to [mattleong/pi-better-openai](https://github.com/mattleong/pi-better-openai), with footer behavior adapted for this package so it does not replace the custom `style` footer. The Codex provider transport comes from [howaboua/pi-codex-conversion](https://github.com/IgorWarzocha/howaboua-pi-stuff/tree/main/packages/pi-codex-conversion).

## Features

- `/fast` toggles OpenAI priority mode for supported models. OpenAI Codex uses a custom transport that sends the complete Fast Mode contract (`service_tier`, Codex originator, and priority routing hint) across WebSocket, SSE, retries, and cached continuations.
- `/openai-usage` shows OpenAI Codex subscription usage.
- `/openai-settings` opens a TUI settings picker for fast mode, usage, and image settings.
- `openai_image` tool and `/openai-image` generate/edit images through OpenAI Codex subscription auth.
- Usage is exposed as an extension status row below the custom footer, e.g. `5h: 100% ↺ 4h24m | 7d: 97% ↺ 2d6h`.
- Fast mode is surfaced in the custom prompt box model metadata instead of taking over the footer.

## Auth

Uses OpenAI Codex OAuth credentials from pi/model registry or `~/.pi/agent/auth.json`. If missing, run:

```bash
/login openai-codex
```

## Config

Config lives in the first existing path, or is bootstrapped globally:

- Project: `.pi/extensions/pi-better-openai.json`
- Global: `~/.pi/agent/extensions/pi-better-openai.json`

Footer modes in this package are intentionally limited to:

- `status` — publish usage/status to the existing style footer status row.
- `off` — hide Better OpenAI status.
