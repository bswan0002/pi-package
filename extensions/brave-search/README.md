# brave-search

Adds a `brave_search` tool that lets pi search the web using the [Brave Search API](https://api.search.brave.com/app/documentation/web-search/get-started).

This is a fallback for non-Codex models when hosted Codex search is unavailable.
Codex models use the bundled `web_run` tool (`tools.web__run` in Code/Notebook).
Brave is removed from ordinary Pi and nested tool surfaces on Codex routes,
including renamed Codex providers, and restored when switching away.

## Setup

The extension reads your API key from the environment:

```bash
export BRAVE_SEARCH_API_KEY="$(security find-generic-password -a "$USER" -s brave-search-api-key -w 2>/dev/null)"
```

That line can live in `~/.zshrc` if you store the key in macOS Keychain with service name `brave-search-api-key`.

## Tool

### `brave_search`

Parameters:

- `query` — search query.
- `count` — optional number of results, default `5`, max `20`.
- `offset` — optional result offset for pagination.
- `country` — optional Brave country code, e.g. `US`, `GB`, or `ALL`.
- `searchLang` — optional search language code, e.g. `en`.
- `safeSearch` — optional `off`, `moderate`, or `strict`.
- `freshness` — optional `pd`, `pw`, `pm`, or `py`.
