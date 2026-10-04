# fast

Provider-neutral `/fast` shortcut. Currently delegates to the bundled Codex
Conversion's `/codex fast` on Codex routes and adapted OpenAI Responses routes.
Unsupported routes warn without changing any settings. Provider integrations
own eligibility, persistence, environment overrides, and transport lifecycle.

Conversion's resolved fast state appears beside the model in the style editor.
The badge means priority processing was requested, not server-confirmed.
Conversion's status shows quota percentages and compact reset countdowns from
the same usage response, using its existing refresh cadence.

Better OpenAI's `/openai-usage`, `/openai-settings`, and `--fast` are removed.
Its old `pi-better-openai.json` files are ignored and may be deleted manually.
Set fast mode through `/fast`, `/codex openai`, or `PI_CODEX_FAST`; no old
standalone preference is imported into Conversion.
