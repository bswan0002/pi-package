# fast

Provider-neutral `/fast` shortcut. Currently delegates to the bundled Codex
Conversion's `/codex fast` on Codex routes and adapted OpenAI Responses routes.
Unsupported routes warn without changing any settings. Provider integrations
own eligibility, persistence, environment overrides, and transport lifecycle.

`/fast` changes only the current model family (Astra, Sol, Terra, Luna, or
Other), preserving the other families and Daybreak. It turns Fast or Ultrafast
off, then turns an off family on as ordinary Fast. Use `/codex` for Ultrafast
selection and All models Fast Mode. `PI_CODEX_FAST=ultrafast` pins the mode just
like boolean overrides.
Legacy boolean preferences retain their meaning through upstream migration.

Conversion's resolved fast state appears beside the current model in the style
editor.
The `fast` or `ultrafast` badge means that service tier was requested, not
server-confirmed. Daybreak and base-cost estimates remain in conversion status.
Conversion's status shows quota percentages and compact reset countdowns from
the same usage response, using its existing refresh cadence.

Better OpenAI's `/openai-usage`, `/openai-settings`, and `--fast` are removed.
Its old `pi-better-openai.json` files are ignored and may be deleted manually.
Set fast mode through `/fast`, `/codex openai`, or `PI_CODEX_FAST`; no old
standalone preference is imported into Conversion.
