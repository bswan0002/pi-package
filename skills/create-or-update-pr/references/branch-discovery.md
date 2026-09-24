# Branch discovery helper

Run `scripts/pr-context.py` relative to the skill directory, with the target worktree as the current directory. It only reads local Git state and performs GitHub/remote lookups. It never publishes, fetches, or changes refs.

## Output and decisions

- `repository`: target GitHub repository resolved through `gh repo view`; override with `--repo OWNER/REPO` for forks or ambiguous CLI defaults.
- `head`, `head_sha`, `working_tree`: current branch, committed snapshot, and dirty files. Detached HEAD fails explicitly.
- `upstream`: tracking branch, **not** a parent hint.
- `publication`: head remote/repository/branch, live published SHA, and local-only/remote-only commit counts when the object is available. The head remote defaults to the configured tracking remote, then `origin`; override with `--head-remote` when the intended publication remote differs. No published ref means a push is needed, not that a push is approved. Remote-only commits require reconciliation, never an automatic force-push.
- `open_pr`: successful exact branch and owner match, including full body/base/draft state. An empty successful result is distinct from a failed lookup. In unusual same-owner repository arrangements, independently confirm the PR's head repository before writing.
- `metadata`, `creation`, `creation_checkouts`, `parent_candidates`: current-branch parent evidence. Creation includes its reflog timestamp. For a new PR without an explicit base, a `HEAD`/`@` creation source triggers a search of the main and registered linked worktrees' HEAD reflogs, including retained logs for unavailable worktree paths. A checkout must name the current branch, match the creation timestamp exactly, and have both old and new HEAD equal the creation SHA. Detached-HEAD/hash sources are excluded. Matching entries include their source and reflog path; ambiguous sources remain warnings. Repository-qualified metadata is accepted only for the target repository. Remote prefixes are normalized for comparison; ancestry and target branch existence still need corroboration.
- `base`: a proposed branch, its live GitHub SHA, merge-base, ancestry checks, local-parent unpublished count, scoped commits/files, and a full diff command. SHA-based commands avoid stale tracking refs and ambiguous local branch names.
- `warnings`: unresolved evidence, missing objects/history, conflicting hints, or unpublished parent commits. Resolve these before the proposal. A candidate in `base` is not permission to publish or proof of a correct parent.

The helper never ranks every branch by nearest merge-base. That can select a sibling, descendant, or the head's own published copy. It also never substitutes the repository default or `HEAD~1` when evidence is absent.

## Happy path / stop rule

For a new PR, accept either agreeing current-branch metadata and `branch: Created from <parent>`, or a `Created from HEAD`/`@` entry correlated with an unambiguous creation-time HEAD checkout. Any supplied metadata must agree. The live remote parent must exist, the creation commit must belong to both head and parent history, and the parent must not already contain HEAD. With no warnings, use this scope for the proposal and stop discovery.

Checkout correlation is deliberately exact, not a search for the latest checkout or the nearest branch. Expired logs, renamed branches, detached creation, worktree creation without a named-source checkout, and operations spanning different timestamp seconds may still require metadata or manual confirmation. These reflogs are evidence, not a permanent parent relationship.

An existing PR supplies the authoritative base even when the original branch parent differs. An explicit requested base takes priority but changing an existing PR's target must be disclosed and approved.

`--base` accepts a branch name in the target repository, not `origin/branch`, a SHA, or a three-dot expression. It is for an explicitly requested or manually confirmed base, not a way to evade conflicting evidence.

## Missing objects: targeted fetch

The live GitHub base/head SHA may not exist locally. First identify a remote belonging to the appropriate repository; do not assume `origin` is the target in a fork. Then fetch only the relevant branch:

```bash
git fetch --no-tags "$remote" "refs/heads/$branch:refs/remotes/$remote/$branch"
```

Rerun discovery afterward. If Git rejects a non-fast-forward tracking-ref update, inspect the discrepancy; do not silently force it. Never write `$repo/.git/refs/...`: linked worktrees have a `.git` file, not a directory. Do not switch branches or change working-tree content for discovery.

For shallow repositories, inspect `git rev-parse --is-shallow-repository` and fetch sufficient relevant history before drawing ancestry conclusions. Missing history is not evidence of unrelated branches.

## Fallback evidence

Only investigate beyond the current branch when the helper cannot establish a reliable scope:

1. Inspect candidate-specific reflogs, logs, and merge-bases. Rebase/reset may invalidate the creation SHA without changing the intended parent; explain that instead of blindly accepting or rejecting the hint.
2. Inspect `git worktree list` and current Worktrunk configuration at `${XDG_CONFIG_HOME:-$HOME/.config}/worktrunk/config.toml` if relevant. A `stack` alias using `wt switch --create --base=@` means its parent was the active branch. Read configuration; never execute `wt stack` for discovery. `worktrunk.history` is navigation history, not a parent map.
3. Compare candidate-specific diffs. If the local parent has unpublished commits, explain that GitHub's diff may include inherited work until the parent is published. Do not publish it without approval.
4. If evidence conflicts, the parent was deleted/merged, or multiple candidates remain plausible, ask the user for the intended base. Only use the default branch when history and intended scope support it.

## Before publication

Rerun the helper after approval. Compare head SHA, dirty state, remote publication state, base SHA, and existing PR metadata with the proposal. If another PR appeared, do not create a duplicate. If the base moved, inspect the new diff; seek renewed approval for material scope/content changes. Preserve human edits and reconcile new commits before writing.

This helper intentionally does not mutate Jira or create/update PRs. Follow the skill's approval gate, explicit push/refspec instructions, and Jira transition reference for those operations.
