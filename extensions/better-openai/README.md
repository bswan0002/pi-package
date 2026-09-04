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

Project config overrides global config; state is saved to the project file when it exists, otherwise globally. If neither file exists, one is bootstrapped globally:

- Project: `.pi/extensions/pi-better-openai.json`
- Global: `~/.pi/agent/extensions/pi-better-openai.json`

Footer modes in this package are intentionally limited to:

- `status` — publish usage/status to the existing style footer status row.
- `off` — hide Better OpenAI status.

## Models and fast mode

GPT-6 Astra supports `/fast`. The custom Codex transport preserves Pi's refreshable model catalog rather than replacing it with a bundled list. This keeps model availability, reasoning levels, tool capabilities, context limits, and pricing metadata up to date. Conversion-only model aliases are not injected; add custom models through Pi's `models.json` if needed.

If Astra is missing from `/model`, run `pi update --models`, then restart Pi. Account access and server-side fast-mode availability still apply.

Omit `supportedModels` from `pi-better-openai.json` to inherit this extension's maintained fast-mode allowlist. An explicit array replaces the defaults; `[]` disables fast eligibility for every model. Older bootstrapped configs saved a snapshot of the defaults: remove that property if you want future additions automatically. Restart Pi after changing config or provider code.

Astra cannot disable reasoning; Pi's current catalog hides `off` and maps `minimal` to `low`. This extension also preserves Pi's conservative context limit (currently 272K), rather than automatically opting into the model's 1.05M maximum. Explicit `models.json` model overrides remain supported.

Billing differs by authentication: [Codex Fast mode](https://developers.openai.com/codex/speed/) consumes 2.5× Standard subscription credits for Astra where available; the [API model page](https://developers.openai.com/api/docs/models/gpt-6-astra) lists 2× applicable API rates. Pi's dollar estimates are not a subscription-credit meter; use `/openai-usage` for account usage. A local `fast` indicator means priority processing was requested, not that the server confirmed it.

## Checks

```bash
npm run test:better-openai
npm run typecheck
```

Tests use isolated config and model stores and do not make live model requests.
