#!/usr/bin/env bash
set -euo pipefail

say() { printf '%s\n' "$*"; }
code() { printf '`%s`' "$*"; }

if ! git_root=$(git rev-parse --show-toplevel 2>/dev/null); then
  say "Not inside a git repository."
  exit 1
fi
cd "$git_root"

current_branch=$(git branch --show-current 2>/dev/null || true)
head_ref="HEAD"
if [[ -n "$current_branch" ]]; then head_ref="$current_branch"; fi

say "# PR review context"
say ""
say "- Repository: $(code "$git_root")"
say "- Current branch: $(code "${current_branch:-DETACHED}")"
say "- HEAD: $(code "$(git rev-parse --short HEAD)")"
say ""

fetch_ref_if_possible() {
  local ref="$1"
  if git show-ref --verify --quiet "refs/remotes/origin/$ref"; then
    git fetch --quiet origin "$ref" >/dev/null 2>&1 || true
    printf 'origin/%s' "$ref"
    return 0
  fi
  if git ls-remote --exit-code --heads origin "$ref" >/dev/null 2>&1; then
    git fetch --quiet origin "$ref:$git_root/.git/refs/remotes/origin/$ref" >/dev/null 2>&1 || true
    if git show-ref --verify --quiet "refs/remotes/origin/$ref"; then
      printf 'origin/%s' "$ref"
      return 0
    fi
  fi
  if git show-ref --verify --quiet "refs/heads/$ref"; then
    printf '%s' "$ref"
    return 0
  fi
  printf '%s' "$ref"
}

json_get() {
  local key="$1"
  python3 -c 'import json,sys; data=json.load(sys.stdin); v=data.get(sys.argv[1], ""); print("" if v is None else v)' "$key"
}

pr_json=""
if command -v gh >/dev/null 2>&1; then
  pr_json=$(gh pr view --json number,url,state,baseRefName,headRefName,title,isDraft 2>/dev/null || true)
fi

base_ref=""
base_reason=""
confidence="low"
pr_number=""

if [[ -n "$pr_json" ]]; then
  pr_number=$(printf '%s' "$pr_json" | json_get number)
  pr_url=$(printf '%s' "$pr_json" | json_get url)
  pr_state=$(printf '%s' "$pr_json" | json_get state)
  pr_base=$(printf '%s' "$pr_json" | json_get baseRefName)
  pr_head=$(printf '%s' "$pr_json" | json_get headRefName)
  pr_title=$(printf '%s' "$pr_json" | json_get title)
  pr_draft=$(printf '%s' "$pr_json" | json_get isDraft)
  base_ref=$(fetch_ref_if_possible "$pr_base")
  base_reason="GitHub PR #$pr_number targets $pr_base"
  confidence="high"

  say "## GitHub PR"
  say ""
  say "- PR: #$pr_number $(code "$pr_title")"
  say "- URL: $pr_url"
  say "- State: $(code "$pr_state")"
  say "- Draft: $(code "$pr_draft")"
  say "- Head: $(code "$pr_head")"
  say "- Base: $(code "$pr_base")"
  say ""
else
  say "## GitHub PR"
  say ""
  if command -v gh >/dev/null 2>&1; then
    say "- No open PR found for the current branch with $(code "gh pr view")."
  else
    say "- $(code "gh") is not installed or not on PATH; skipping PR lookup."
  fi
  say ""
fi

merge_base_for() {
  git merge-base "$1" HEAD 2>/dev/null || true
}

ahead_count_from_base() {
  local mb="$1"
  git rev-list --count "$mb..HEAD" 2>/dev/null || printf '999999'
}

if [[ -z "$base_ref" ]]; then
  candidates=()

  upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
  if [[ -n "$upstream" && "$upstream" != "$current_branch" ]]; then candidates+=("$upstream"); fi

  for name in main master develop trunk; do
    git show-ref --verify --quiet "refs/remotes/origin/$name" && candidates+=("origin/$name")
    git show-ref --verify --quiet "refs/heads/$name" && candidates+=("$name")
  done

  while IFS= read -r ref; do
    [[ -z "$ref" ]] && continue
    [[ "$ref" == "origin/HEAD" ]] && continue
    [[ -n "$current_branch" && ( "$ref" == "$current_branch" || "$ref" == "origin/$current_branch" ) ]] && continue
    candidates+=("$ref")
  done < <(git for-each-ref --format='%(refname:short)' refs/heads refs/remotes 2>/dev/null | sort -u)

  best_ref=""
  best_score=999999
  best_mb=""
  seen=" "
  for ref in "${candidates[@]}"; do
    [[ "$seen" == *" $ref "* ]] && continue
    seen+="$ref "
    git rev-parse --verify --quiet "$ref^{commit}" >/dev/null || continue
    mb=$(merge_base_for "$ref")
    [[ -z "$mb" ]] && continue
    # If the candidate already contains HEAD, it is probably a descendant/integration branch, not our base.
    if git merge-base --is-ancestor HEAD "$ref" 2>/dev/null; then continue; fi
    score=$(ahead_count_from_base "$mb")
    # Prefer candidates with the nearest fork point; ties keep earlier, higher-priority candidates.
    if (( score < best_score )); then
      best_score=$score
      best_ref="$ref"
      best_mb="$mb"
    fi
  done

  if [[ -n "$best_ref" ]]; then
    base_ref="$best_ref"
    base_reason="Inferred nearest fork point from available local/remote branches"
    confidence="medium"
    if [[ "$best_ref" == "origin/main" || "$best_ref" == "main" || "$best_ref" == "origin/master" || "$best_ref" == "master" ]]; then
      confidence="medium"
    fi
  else
    base_ref="HEAD~1"
    base_reason="Could not infer a base branch; falling back to previous commit"
    confidence="low"
  fi
fi

merge_base=$(git merge-base "$base_ref" HEAD 2>/dev/null || true)

say "## Selected review base"
say ""
say "- Base ref: $(code "$base_ref")"
say "- Reason: $base_reason"
say "- Confidence: $(code "$confidence")"
if [[ -n "$merge_base" ]]; then
  say "- Merge-base: $(code "$(git rev-parse --short "$merge_base")")"
fi
say "- Review diff: $(code "$base_ref...HEAD")"
say ""

say "## Commands"
say ""
say '```bash'
say "git diff --stat $base_ref...HEAD"
say "git diff --name-status $base_ref...HEAD"
say "git log --oneline --decorate $base_ref..HEAD"
say "git diff $base_ref...HEAD -- <path>"
say '```'
say ""

say "## Changed files"
say ""
say '```'
git diff --name-status "$base_ref...HEAD" || true
say '```'
say ""

say "## Diff stat"
say ""
say '```'
git diff --stat "$base_ref...HEAD" || true
say '```'
say ""

say "## Commits on head side"
say ""
say '```'
git log --oneline --decorate "$base_ref..HEAD" || true
say '```'
