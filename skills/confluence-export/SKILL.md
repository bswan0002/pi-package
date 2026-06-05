---
name: confluence-export
description: Fetch Atlassian Confluence Cloud wiki pages and save them as Markdown. Use when the user asks to retrieve a Confluence/Atlassian wiki page, export a page to result.md, or convert a Confluence URL/page ID using ATLASSIAN_EMAIL and ATLASSIAN_API_KEY credentials.
---

# Confluence Export

Use this skill to fetch a Confluence Cloud page through the REST API and generate a local Markdown file.

## Script

From the repository root, run:

```bash
skills/confluence-export/scripts/confluence-to-md.sh '<confluence-url-or-page-id>' [output.md]
```

If this skill is installed globally or the relative path is not present, resolve the script relative to this `SKILL.md` file and run that absolute path instead.

Examples:

```bash
skills/confluence-export/scripts/confluence-to-md.sh \
  'https://example.atlassian.net/wiki/spaces/SPACE/pages/123456789/Page+Title' \
  result.md

ATLASSIAN_SITE='https://example.atlassian.net/wiki' \
  skills/confluence-export/scripts/confluence-to-md.sh 123456789 result.md
```

## Credentials

The script expects these environment variables to be exported:

- `ATLASSIAN_EMAIL`
- `ATLASSIAN_API_KEY`

Never print or include these secrets in responses or generated files.

## Dependencies

The script expects these command-line tools:

- `zsh`
- `curl`
- `python3`
- `pandoc`

## Output

The generated Markdown starts with the page title and source URL, then includes the converted page body. Code macros are converted to fenced code blocks when possible.
