---
name: pr-validation
description: Generate a high-signal validation plan for the current branch or pull request. Use when asked for PR testing steps, validation steps, QA checklist, or how to verify branch changes before merge. Discovers an open GitHub PR with gh when possible, otherwise infers the likely base branch and analyzes the diff.
---

# PR Validation

You are generating a practical validation plan for the current branch's changes.

## Goals

- Identify what changed and what needs validation before merge.
- Prefer GitHub PR metadata when available because it gives the authoritative merge target.
- If no PR exists, infer the most likely base branch and clearly state the assumptions.
- Produce specific commands and manual QA steps tied to changed files and product behavior.
- Do not make code changes. This skill is for planning validation only.

## Workflow

From the repository root, run:

```bash
bash skills/pr-validation/scripts/pr-validation-context.sh
```

If this skill is installed globally or the relative path is not present, resolve the script relative to this `SKILL.md` file and run that absolute path instead.

The script prints:

- current branch and repository root
- open PR metadata from `gh pr view` when available
- selected base ref and why it was selected
- exact diff refs/commands to use
- changed files, stats, commits, and likely test/config files

Then inspect the changed files and diff using the commands it prints, typically:

```bash
git diff --stat <base>...HEAD
git diff --name-status <base>...HEAD
git diff <base>...HEAD -- <path>
```

Use three-dot diff (`base...HEAD`) unless the script says otherwise.

## Validation planning procedure

1. Summarize the validation scope:
   - PR number/title/base/head if available
   - selected base ref and confidence
   - changed files by area
2. Read enough of the diff to understand behavior, risks, and affected user flows.
3. Identify repo-specific validation commands from package scripts, changed test files, CI config, or project docs when visible.
4. Produce a prioritized plan:
   - fast automated checks
   - targeted tests
   - manual QA scenarios
   - edge cases/regression checks
   - screenshots/demo evidence if UI-facing
5. Call out assumptions and what you could not validate from static inspection.

## Output format

Use this structure:

```markdown
## Validation scope
- Base: `<base>`
- Head: `<branch or HEAD>`
- PR: `#123` / none
- Diff: `<base>...HEAD`
- Changed areas: ...

## Recommended validation
1. ...

## Commands to run
```bash
...
```

## Manual QA
- ...

## Edge cases / regression risks
- ...

## Evidence to add to PR
- ...
```

Prefer concise, actionable steps over generic checklists.
