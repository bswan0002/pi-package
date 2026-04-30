---
name: qq
description: Answer a user question directly using only readonly inspection. Use when the user wants an explanation, answer, or clarification without code or file changes.
allowed-tools: read bash
---

# QQ

Answer the user's question directly and concisely.

Use only readonly inspection operations when you need context from the project:

- `read` for reading files
- `bash` only for non-mutating commands such as `rg`, `fd`, `find`, `ls`, `pwd`, and `git status`/`git diff`

Prefer:

- `rg` over `grep` for searching file contents
- `fd` over `find` for finding files, when available

Caveats:

- `rg` and `fd` respect ignore files by default; use `grep`/`find` or explicit flags when ignored or hidden files must be inspected.
- Do not edit files, write files, delete files, install packages, run tests/builds that may write artifacts, or perform any mutating operation.
