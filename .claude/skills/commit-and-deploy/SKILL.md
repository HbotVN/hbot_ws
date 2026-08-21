---
name: commit-and-deploy
description: Commit outstanding changes (including in touched git submodules), update agent/walkthrough.md and agent/workspace_overview.md per the repo's agent workflow convention, then deploy the result to the Pi. Use when the user asks to commit and deploy, ship this to the robot, or finalize+push changes to the Pi in one go.
---

# Commit, Update Docs, and Deploy to Pi

`hbot_ws` is a colcon workspace where almost every package under `src/` is a **separate git submodule** (see `CLAUDE.md`). A plain `git add -A && git commit` at the top level only records *which submodule commit* is checked out — it does not save the actual code changes inside a dirty submodule. This skill handles both layers correctly, keeps the `agent/` planning docs in sync, and then hands off to `deploy-to-pi`.

## Steps

1. **Survey what's actually dirty, at both layers:**
   ```bash
   git status
   git submodule status
   ```
   For every submodule reported dirty (or listed with a leading `+`/`-` in `submodule status`), also run `git -C src/<package> status` and `git -C src/<package> diff` to see its real changes. Don't assume — check each one; a package can have uncommitted work even if the top-level `git status` only shows it as "modified content" with no detail.

2. **Commit inside each dirty submodule first**, in that submodule's own repo:
   - `cd src/<package>` (or `git -C src/<package> ...`).
   - Follow the standing git policy: if the submodule's working tree is on its default branch (`main`/`master`), branch first before committing, unless the user has told you to commit straight to it.
   - Write a commit message describing the actual change, not a generic "update".
   - Only push if the user has asked to push, or has previously authorized pushing in this session — committing locally does not require the same confirmation, but pushing to a remote is outward-facing.
   - Repeat for every dirty submodule before moving on.

3. **Update the agent docs**, per `CLAUDE.md`'s Agent Workflow Convention:
   - Append a new dated section to `agent/walkthrough.md` describing what changed this round — link touched files with relative markdown links, same style as existing entries.
   - Keep `agent/workspace_overview.md` in sync if the change affects package roles, key files, or architecture described there (not every change needs this — only when it makes the overview stale).
   - Do this for *all* the changes being shipped, not just the last message's worth — check recent conversation history for anything not yet documented.

4. **Commit the top-level `hbot_ws` repo:**
   ```bash
   git add -A
   git commit -m "..."
   ```
   This captures the updated submodule pointers (from step 2), the `agent/*.md` doc updates (from step 3), and any changes to files that live directly in this repo (`hbot_web`, top-level scripts, Docker recipes, docs). Same branch-first-if-on-default-branch policy applies here as in step 2.

5. **Deploy to the Pi** — invoke the `deploy-to-pi` skill now (via the Skill tool) rather than duplicating its steps here. It builds `install_pi/`, syncs it to the robot, and restarts the service.

6. **Report back concisely:** which submodules got commits (with a one-line summary each), the top-level commit, and the deploy outcome from step 5. If anything was skipped (e.g. a submodule push held back pending user confirmation), say so explicitly rather than letting it pass silently.

## When to deviate

- If the user only wants some of the dirty changes committed (not everything currently outstanding), confirm scope before running `git add -A` — don't sweep up unrelated in-progress work.
- If a submodule has no actual content changes (just a pointer bump from someone else's commit), skip step 2 for it.
