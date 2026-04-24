---
name: bswan0002-pr-review
description: Review the current branch or pull request. Use when asked to review a PR, review branch changes, find issues before merge, or compare the working branch to the branch it was based on. Discovers an open GitHub PR with gh when possible, otherwise infers the likely base branch and reviews the resulting diff.
---

# PR Review

You are doing a PR-style code review of the current branch's changes.

## Goals

- Review only the changes that are intended for merge, not unrelated history.
- Prefer GitHub PR metadata when available because it gives the authoritative merge target.
- If no PR exists, infer the most likely base branch and clearly state the confidence/assumptions.
- Focus on defects, regressions, security issues, data loss, concurrency bugs, missing tests, and compatibility problems.
- Do not make code changes unless the user explicitly asks for fixes. This skill is for review.

## Workflow

From the repository root, run:

```bash
bash skills/bswan0002-pr-review/scripts/pr-context.sh
```

If this skill is installed globally or the relative path is not present, resolve the script relative to this `SKILL.md` file and run that absolute path instead.

The script prints:

- current branch and repository root
- open PR metadata from `gh pr view` when available
- selected base ref and why it was selected
- exact diff refs/commands to use for review
- changed files, stats, and commit list

Then inspect the changed files and diff using the commands it prints, typically:

```bash
git diff --stat <base>...HEAD
git diff --name-status <base>...HEAD
git diff <base>...HEAD -- <path>
```

Use three-dot diff (`base...HEAD`) for review unless the script says otherwise. This compares the branch against the merge-base with the selected base branch and avoids reviewing commits already on the base.

## Base selection rules

1. If `gh pr view --json number,url,state,baseRefName,headRefName,title,isDraft` succeeds for the current branch, use the PR's `baseRefName` as the review base. Fetch `origin/<baseRefName>` when possible and diff `origin/<baseRefName>...HEAD`.
2. If no PR exists, use the script's inferred base. It considers upstream, common default branches (`main`, `master`, `develop`, `trunk`), and other local/remote branches, then chooses the likely fork point.
3. If the base is ambiguous, tell the user which base was selected and ask whether they want a different target before giving high-confidence conclusions.

## Review procedure

1. Summarize the review scope:
   - PR number/title/base/head if available
   - selected base ref and confidence
   - number/type of changed files
2. Read the diff and relevant surrounding code. Use `git diff <base>...HEAD -- <file>` plus direct file reads for context.
3. Check tests/config/docs when impacted.
4. Produce findings only when actionable and tied to changed code.
5. If there are no findings, say so and mention any residual risks or areas not checked.

## Output format

Use this structure:

```markdown
## Review scope
- Base: `<base>`
- Head: `<branch or HEAD>`
- PR: `#123` / none
- Diff: `<base>...HEAD`

## Findings
1. **[severity] Title** — `path:line`
   - Problem: ...
   - Impact: ...
   - Suggested fix: ...

## Notes / residual risk
- ...
```

Severity should be one of: `critical`, `high`, `medium`, `low`, `nit`.

Do not pad with generic advice. Prefer a short, high-signal review.
