---
agent: agent
description: "Land the current branch — run the gate, commit, push, merge the pull request into main, and delete every feature branch so only main and production remain."
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Land the change and clean up

Take the current branch from wherever it is to merged, then leave the repository holding `main`
and `production` and nothing else — locally and on the remote.

Stop and ask before anything that could lose work. Never force-push `main` or `production`,
never delete them, and never pass `--no-verify`.

## 1. Refuse to start in the wrong place

`git branch --show-current` must be a feature branch. On `main` or `production`, stop and say so.

## 2. Commit what is uncommitted

The gate runs before the commit, not after it. It is listed in
[checking-your-work.instructions.md](../instructions/checking-your-work.instructions.md) — including
the Security Rules runner, which only applies when `firestore.rules` changed — so read it there
rather than working from a copy that has drifted.

Fix what is red, then commit. The message is English — an imperative subject, and a body that
says why rather than what. Review `git status` before `git add -A`: an unfamiliar file may be
somebody's work in progress, not yours to commit.

## 3. Push, and open the pull request if there is none

```bash
git push -u origin "$(git branch --show-current)"
gh pr view --json number,title,state
```

If there is no pull request, open one against `main` with `gh pr create --base main`, writing the
body to a file and passing `--body-file` so `gh` never prompts.

## 4. Merge it

Auto-merge is disabled on this repository, so `gh pr merge --auto` fails. Wait for the checks
instead:

```bash
gh pr checks <n> --watch
```

`main` requires branches to be up to date, so a pull request opened before another merge reports
`mergeStateStatus: BEHIND`. Rebase onto `origin/main` and force-push with `--force-with-lease`,
then wait for the checks again.

`main` accepts squash merges only. Give the subject and the body explicitly, or `gh` opens an
editor and hangs:

```bash
gh pr merge <n> --squash --subject "<pull request title> (#<n>)" --body-file <file>
```

Leave `--delete-branch` off. It removes the branch locally and remotely while it may still be
checked out; step 5 does the same work in an order that cannot strand the working tree.

Promotion to `production` is a different operation and not part of this prompt: it is a pull
request from `main`, merged with a merge commit.

## 5. Delete every other branch

```bash
git switch main
git pull --ff-only
git fetch --prune
```

List what would go before deleting anything, and show that list:

```bash
git for-each-ref --format='%(refname:short)' refs/heads | grep -vx -e main -e production
git for-each-ref --format='%(refname:lstrip=3)' refs/remotes/origin | grep -vx -e main -e production -e HEAD
```

For each branch on that list, confirm it is finished before removing it — its pull request is
`MERGED`, or it has no pull request and no commits of its own. Anything else: stop and ask.

A squash merge rewrites the commits, so `git branch -d` will call a merged branch unmerged and
`git log origin/main..<branch>` will still list its commits. Neither proves anything. Confirm
through the pull request state, then delete with `-D`:

```bash
git branch -D <branch>
git push origin --delete <branch>
```

Delete one branch per command. zsh does not word-split an unquoted variable, so a space-separated
list passed to `git push origin --delete` fails with "invalid refspec"; and piping the loop
through `grep` or `sed` hides the errors, which makes a failed delete look like a success.

## 6. Show the end state

```bash
git branch -a
```

Only `main`, `production` and their remote counterparts may remain. Report the merged pull
request number and the branches that were deleted.
