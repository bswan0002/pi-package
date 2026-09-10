#!/usr/bin/env python3
"""Read-only PR discovery. Run from the worktree; requires git, gh, Python 3."""

import argparse
import json
import subprocess
import sys
from urllib.parse import quote


def run(*args, optional=False):
    result = subprocess.run(args, text=True, capture_output=True)
    if result.returncode:
        if optional:
            return None
        raise RuntimeError(f"{list(args)!r} failed: {result.stderr.strip() or result.stdout.strip()}")
    return result.stdout.strip()


def gh_json(*args):
    return json.loads(run("gh", *args))


def config(key):
    return run("git", "config", "--get", key, optional=True)


def ancestor(older, newer):
    result = subprocess.run(
        ["git", "merge-base", "--is-ancestor", older, newer], capture_output=True, text=True
    )
    if result.returncode not in (0, 1):
        raise RuntimeError(result.stderr.strip())
    return result.returncode == 0


def discover(args):
    root = run("git", "rev-parse", "--show-toplevel")
    branch = run("git", "branch", "--show-current")
    if not branch:
        raise RuntimeError("Detached HEAD: choose a branch before PR discovery.")
    head = run("git", "rev-parse", "HEAD")
    repo = gh_json("repo", "view", *([args.repo] if args.repo else []),
                   "--json", "nameWithOwner,defaultBranchRef")
    target = repo["nameWithOwner"]
    metadata = {key: config(f"branch.{branch}.{key}") for key in
                ("gh-merge-base", "vscode-merge-base", "github-pr-base-branch")}
    reflog = run("git", "reflog", "show", "--format=%H%x09%gs", f"refs/heads/{branch}")
    creation = next((line.split("\t", 1) for line in reversed(reflog.splitlines())
                     if "\tbranch: Created from " in line), None)
    remote = args.head_remote or config(f"branch.{branch}.remote") or "origin"
    remote_url = run("git", "remote", "get-url", remote)
    # Resolve repository identity through gh, rather than guessing from SSH/HTTPS URL syntax.
    head_repo = gh_json("repo", "view", remote_url, "--json", "nameWithOwner")["nameWithOwner"]
    prs = gh_json("pr", "list", "--repo", target, "--head", branch, "--state", "open",
                  "--json", "number,url,title,body,baseRefName,headRefName,headRepositoryOwner,isDraft")
    owner = head_repo.split("/")[0]
    matches = [pr for pr in prs if pr["headRefName"] == branch
               and pr["headRepositoryOwner"]["login"].lower() == owner.lower()]
    if len(matches) > 1:
        raise RuntimeError("Multiple matching open PRs; resolve manually.")
    pr = matches[0] if matches else None
    if pr:
        pr = gh_json("pr", "view", str(pr["number"]), "--repo", target, "--json",
                     "number,url,title,body,baseRefName,headRefName,headRepositoryOwner,isDraft")

    remotes = run("git", "remote").splitlines()

    def normalize(value):
        if not value:
            return None
        if "#" in value:
            parts = value.split("#", 2)
            if len(parts) != 3 or "/".join(parts[:2]).lower() != target.lower():
                return None
            value = parts[2]
        for prefix in ("refs/heads/", "refs/remotes/"):
            if value.startswith(prefix):
                value = value[len(prefix):]
                break
        for name in sorted(remotes, key=len, reverse=True):
            if value.startswith(name + "/"):
                value = value[len(name) + 1:]
                break
        return value if value not in (branch, "HEAD", "@") else None

    hints = {key: normalize(value) for key, value in metadata.items() if value}
    creation_source = creation[1].removeprefix("branch: Created from ") if creation else None
    if creation_source:
        hints["creation_reflog"] = normalize(creation_source)
    candidates = sorted({value for value in hints.values() if value})
    warnings = []
    base = None
    reason = None
    if args.base:
        base, reason = args.base, "Explicit requested base (subject to proposal approval)"
        if pr and base != pr["baseRefName"]:
            warnings.append("Existing PR would be retargeted; obtain explicit approval.")
    elif pr:
        base, reason = pr["baseRefName"], "Existing PR base is authoritative"
    elif len(candidates) == 1 and all(hints.values()):
        base, reason = candidates[0], "Current-branch hints agree; verify ancestry below"
    else:
        warnings.append("No unambiguous parent evidence. Inspect targeted stack/worktree history or ask the user; do not default to main.")
    if base and any(candidate != base for candidate in candidates):
        warnings.append("Parent hints conflict with selected base; explain before approval.")
    if base and not pr and not args.base:
        metadata_agrees = any(normalize(value) == base for value in metadata.values() if value)
        if not metadata_agrees or normalize(creation_source) != base:
            warnings.append("Metadata and creation source do not independently agree; corroborate the parent manually.")

    # ls-remote success with no matching ref means unpublished; failures are not absence.
    published = run("git", "ls-remote", "--heads", remote, f"refs/heads/{branch}")
    published_sha = published.split()[0] if published else None
    publication = {"remote": remote, "repository": head_repo, "branch": branch,
                   "remote_sha": published_sha, "matches_head": published_sha == head}
    if published_sha and run("git", "cat-file", "-e", f"{published_sha}^{{commit}}", optional=True) is not None:
        publication["local_only_commits"] = int(run("git", "rev-list", "--count", f"{published_sha}..HEAD"))
        publication["remote_only_commits"] = int(run("git", "rev-list", "--count", f"HEAD..{published_sha}"))
    elif published_sha:
        warnings.append("Published head object unavailable locally; fetch the head before deciding push safety.")

    scope = None
    if base:
        if base == branch and target.lower() == head_repo.lower():
            raise RuntimeError("Head and base are the same branch in the same repository.")
        # Ref API verifies exact branch existence and gets its live tip without writing refs.
        ref = gh_json("api", f"repos/{target}/git/ref/heads/{quote(base, safe='')}")
        sha = ref["object"]["sha"]
        scope = {"branch": base, "remote_sha": sha, "reason": reason}
        if run("git", "cat-file", "-e", f"{sha}^{{commit}}", optional=True) is None:
            warnings.append("Base object unavailable locally. Fetch this branch from a verified target-repository remote, then rerun discovery.")
        else:
            merge_base = run("git", "merge-base", sha, "HEAD", optional=True)
            scope["merge_base"] = merge_base
            if not merge_base:
                warnings.append("No merge-base: fetch missing/shallow history or resolve unrelated histories.")
            else:
                scope["base_contains_head"] = ancestor(head, sha)
                scope["creation_on_head_history"] = ancestor(creation[0], head) if creation else None
                scope["creation_on_base_history"] = ancestor(creation[0], sha) if creation else None
                if scope["base_contains_head"]:
                    warnings.append("Base already contains HEAD: no branch changes, or a descendant/integration branch was selected.")
                if not pr and not args.base and (not creation or not scope["creation_on_head_history"]
                                                or not scope["creation_on_base_history"]):
                    warnings.append("Parent hint lacks creation/ancestry corroboration (possibly rebased or expired reflog). Confirm the base manually.")
                local_base = f"refs/heads/{base}"
                if run("git", "show-ref", "--verify", "--quiet", local_base, optional=True) is not None:
                    scope["local_parent_commits_not_on_remote"] = int(run("git", "rev-list", "--count", f"{sha}..{local_base}"))
                    if scope["local_parent_commits_not_on_remote"]:
                        warnings.append("Local parent has commits absent from the remote base. GitHub may include inherited changes; never push the parent without permission.")
                scope["commits"] = run("git", "log", "--oneline", f"{sha}..HEAD").splitlines()
                scope["changed_files"] = run("git", "diff", "--name-status", f"{sha}...HEAD").splitlines()
                scope["diff_command"] = f"git diff {sha}...HEAD"

    return {"root": root, "repository": target, "default_branch": repo["defaultBranchRef"]["name"],
            "head": branch, "head_sha": head,
            "working_tree": run("git", "status", "--short").splitlines(),
            "upstream": run("git", "rev-parse", "--abbrev-ref", "@{upstream}", optional=True),
            "publication": publication, "open_pr": pr, "metadata": metadata,
            "creation": {"sha": creation[0], "source": creation_source} if creation else None,
            "parent_candidates": candidates, "base": scope, "warnings": warnings,
            "next_step": "Resolve warnings before proposing publication" if warnings else
                         "Inspect full diff, repository instructions/templates, and Jira; then propose for approval"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", help="Explicit target OWNER/REPO, particularly for forks")
    parser.add_argument("--head-remote", help="Remote holding the head branch; defaults to upstream remote or origin")
    parser.add_argument("--base", help="User-requested or manually confirmed base branch")
    args = parser.parse_args()
    try:
        print(json.dumps(discover(args), indent=2))
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        print(json.dumps({"error": str(error), "next_step": "Stop and resolve discovery failure; do not assume no PR or guess a base"}), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
