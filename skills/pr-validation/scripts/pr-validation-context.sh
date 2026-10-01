#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git repository" >&2
  exit 1
fi

root="$(git rev-parse --show-toplevel)"
cd "$root"

branch="$(git branch --show-current 2>/dev/null || true)"
head_ref="HEAD"
base_ref=""
base_reason=""
pr_json=""

if command -v gh >/dev/null 2>&1; then
  if pr_json="$(gh pr view --json number,url,state,baseRefName,headRefName,title,isDraft,body 2>/dev/null)"; then
    base_name="$(printf '%s' "$pr_json" | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { try { const j = JSON.parse(s); console.log(j.baseRefName || ""); } catch {} });')"
    if [ -n "$base_name" ]; then
      git fetch --quiet origin "$base_name" 2>/dev/null || true
      if git rev-parse --verify --quiet "origin/$base_name" >/dev/null; then
        base_ref="origin/$base_name"
      else
        base_ref="$base_name"
      fi
      base_reason="GitHub PR baseRefName"
    fi
  fi
fi

if [ -z "$base_ref" ]; then
  upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
  if [ -n "$branch" ] && { [ "$upstream" = "$branch" ] || [ "$upstream" = "origin/$branch" ]; }; then
    upstream=""
  fi
  for candidate in "$upstream" origin/main main origin/master master origin/develop develop origin/trunk trunk; do
    if [ -n "$candidate" ] && git rev-parse --verify --quiet "$candidate" >/dev/null; then
      base_ref="$candidate"
      base_reason="inferred from upstream/default branch candidates"
      break
    fi
  done
fi

if [ -z "$base_ref" ]; then
  echo "Could not infer a base ref. Try passing an explicit base to git diff manually." >&2
  exit 1
fi

merge_base="$(git merge-base "$base_ref" HEAD)"

echo "## Repository"
echo "Root: $root"
echo "Branch: ${branch:-detached}"
echo "Head: $head_ref"
echo "Base: $base_ref"
echo "Base reason: $base_reason"
echo "Merge-base: $merge_base"
echo

if [ -n "$pr_json" ]; then
  echo "## GitHub PR"
  printf '%s' "$pr_json" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(s);
    console.log(`Number: #${j.number}`);
    console.log(`Title: ${j.title}`);
    console.log(`URL: ${j.url}`);
    console.log(`State: ${j.state}`);
    console.log(`Draft: ${j.isDraft}`);
    console.log(`Base: ${j.baseRefName}`);
    console.log(`Head: ${j.headRefName}`);
  } catch (e) {
    console.log(s);
  }
});'
  echo
else
  echo "## GitHub PR"
  echo "No open PR detected with gh pr view."
  echo
fi

echo "## Suggested commands"
echo "git diff --stat $base_ref...HEAD"
echo "git diff --name-status $base_ref...HEAD"
echo "git diff $base_ref...HEAD -- <path>"
echo

echo "## Changed file summary"
git diff --stat "$base_ref...HEAD" || true
echo

echo "## Changed files"
git diff --name-status "$base_ref...HEAD" || true
echo

echo "## Commits"
git log --oneline --decorate --no-merges "$base_ref..HEAD" || true
echo

echo "## Likely validation-related files"
git diff --name-only "$base_ref...HEAD" | rg -i '(^|/)(package.json|bun.lock|package-lock.json|pnpm-lock.yaml|yarn.lock|.*test.*|.*spec.*|.*stories.*|playwright|cypress|vitest|jest|eslint|tsconfig|github/workflows|ci|README|CHANGELOG)' || true
