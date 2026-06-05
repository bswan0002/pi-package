#!/usr/bin/env zsh
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage: confluence-to-md.sh <confluence-url-or-page-id> [output.md]

Fetch a Confluence Cloud page and write it as Markdown.

Credentials:
  ATLASSIAN_EMAIL and ATLASSIAN_API_KEY must be exported in the environment.

For page-id-only input, also set ATLASSIAN_SITE, e.g.:
  ATLASSIAN_SITE=https://example.atlassian.net/wiki
EOF
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 2
fi

input="$1"
output="${2:-result.md}"

if [[ -z "${ATLASSIAN_EMAIL:-}" || -z "${ATLASSIAN_API_KEY:-}" ]]; then
  echo "error: ATLASSIAN_EMAIL and ATLASSIAN_API_KEY are required" >&2
  exit 1
fi

page_id=""
api_base=""
source_url="$input"

if [[ "$input" =~ '^https?://' ]]; then
  if [[ "$input" =~ '/pages/([0-9]+)' ]]; then
    page_id="${match[1]}"
  elif [[ "$input" =~ '[?&]pageId=([0-9]+)' ]]; then
    page_id="${match[1]}"
  fi

  if [[ "$input" =~ '^(https?://[^/]+/wiki)' ]]; then
    api_base="${match[1]}/rest/api"
  elif [[ "$input" =~ '^(https?://[^/]+)' ]]; then
    api_base="${match[1]}/wiki/rest/api"
  fi
else
  page_id="$input"
  if [[ -n "${ATLASSIAN_SITE:-}" ]]; then
    api_base="${ATLASSIAN_SITE%/}/rest/api"
    source_url="${ATLASSIAN_SITE%/}/pages/${page_id}"
  fi
fi

if [[ -z "$page_id" || ! "$page_id" =~ '^[0-9]+$' ]]; then
  echo "error: could not determine numeric Confluence page ID from: $input" >&2
  exit 1
fi

if [[ -z "$api_base" ]]; then
  echo "error: could not determine Confluence API base; pass a full URL or set ATLASSIAN_SITE" >&2
  exit 1
fi

for cmd in curl python3 pandoc; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: required command not found: $cmd" >&2
    exit 1
  fi
done

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

json_file="$tmpdir/page.json"
html_file="$tmpdir/body.html"
body_md_file="$tmpdir/body.md"
title_file="$tmpdir/title.txt"

api_url="${api_base}/content/${page_id}?expand=body.storage,version,space"

curl --fail --silent --show-error \
  --user "${ATLASSIAN_EMAIL}:${ATLASSIAN_API_KEY}" \
  --header 'Accept: application/json' \
  --output "$json_file" \
  "$api_url"

python3 - "$json_file" "$html_file" "$title_file" <<'PY'
import html
import json
import re
import sys
from pathlib import Path

json_path = Path(sys.argv[1])
html_path = Path(sys.argv[2])
title_path = Path(sys.argv[3])

data = json.loads(json_path.read_text())
title = data.get("title") or "Confluence Page"
storage = data.get("body", {}).get("storage", {}).get("value") or ""


def macro_to_html(match: re.Match[str]) -> str:
    macro = match.group(0)
    name_match = re.search(r'<ac:structured-macro\b[^>]*\bac:name="([^"]+)"', macro, flags=re.S)
    macro_name = name_match.group(1) if name_match else ""

    plain_match = re.search(
        r'<ac:plain-text-body><!\[CDATA\[(.*?)\]\]></ac:plain-text-body>',
        macro,
        flags=re.S,
    )
    if plain_match:
      body = plain_match.group(1)
      lang_match = re.search(
          r'<ac:parameter\s+ac:name="language">(.*?)</ac:parameter>',
          macro,
          flags=re.S,
      )
      lang = html.unescape(lang_match.group(1).strip()) if lang_match else ""
      class_attr = f' class="language-{html.escape(lang, quote=True)}"' if lang else ""
      return f"<pre><code{class_attr}>{html.escape(body)}</code></pre>"

    # Preserve unknown non-plain-text macros as a small marker instead of dropping them silently.
    return f"<p><em>[Confluence macro omitted: {html.escape(macro_name or 'unknown')}]</em></p>"


content = re.sub(
    r'<ac:structured-macro\b(?:(?!</ac:structured-macro>).)*?</ac:structured-macro>',
    macro_to_html,
    storage,
    flags=re.S,
)

# Remove Confluence editor-only attributes that otherwise become noisy Markdown attributes.
content = re.sub(r'\s+local-id="[^"]*"', "", content)
content = re.sub(r'\s+ac:macro-id="[^"]*"', "", content)

# Drop any remaining Confluence namespaced tags while preserving their inner text.
content = re.sub(r'</?ac:[^>]+>', "", content)

html_path.write_text(content)
title_path.write_text(title)
PY

pandoc "$html_file" \
  --from html \
  --to gfm \
  --wrap none \
  --shift-heading-level-by=1 \
  --output "$body_md_file"

mkdir -p "$(dirname "$output")"
{
  printf '# %s\n\n' "$(cat "$title_file")"
  printf 'Source: <%s>\n\n' "$source_url"
  cat "$body_md_file"
  printf '\n'
} > "$output"

echo "Wrote $output"
