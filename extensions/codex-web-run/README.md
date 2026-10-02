# Codex web run

Loads the pinned `@howaboua/pi-codex-web-run` companion. Remove any separately
enabled copy to avoid duplicate tools, run `npm ci`, and restart Pi.

Use `web_run` in ordinary Pi or `tools.web__run` in Code/Notebook for search,
page opening, link traversal, and in-page finding. Cite returned source URLs.
Authenticate with `/login openai-codex`; see the dependency's README for proxy
configuration. Non-Codex models can fall back to `brave_search`.
