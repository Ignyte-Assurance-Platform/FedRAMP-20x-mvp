---
name: pb-logical-commits
description: Turns staged/unstaged changes into focused conventional commits — groups by logical change, derives type(scope|ticket) from the diff and the branch name, presents the plan, then commits with the repo's real git identity. Triggers: "commit", "commit this", "logical commits", "split into commits", "commitea".
compatibility: git. Any repo. Never pushes.
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills · source commit 3d11d10 -->

# PB - Logical Commits

## 0. Context detection (mandatory)

Read `pb.config.yaml` in the current repo root: `brain.marker: true` → brain; otherwise a pointer with `brain_path`. Load `project.md` from this skill folder if present; its keys override the defaults below. This skill works on the **current repo** (brain or project); it never writes brain-owned artifacts into a project repo.

## 1. Procedure

1. `git status --porcelain` and `git diff HEAD`. Refuse to proceed if `.env` or secrets are staged; untrack them first.
2. **Group** hunks/files into logical changes: a feature, a fix, a refactor, docs, generated files, config. Generated sections (between `PB:*` markers, HUB/ARCHIVE, `.pb-skills.lock`) go in their own `chore(generated): …` commit.
3. **IDs from the branch**: `<type>/<ID>-<desc>` → `ID` (Linear `ABC-123` or brain `wi-<p>-NNN`) via `id_patterns`. Put it in the scope slot: `feat(ABC-123): …` or `docs(wi-maaz20x-004): …`. If no ID, use a path scope from `scopes`.
4. **Message**: `type(scope): imperative summary ≤ 72 chars`, language from `commit_language` (match `git log --oneline -5` if unsure). Body only when the why is not obvious. Types: feat, fix, docs, refactor, chore, test, perf, build, ci, style.
5. **Present the plan** (files per commit + messages). On OK, `git reset`, then for each group `git add <files>` and `git commit -m`.
6. `--no-verify` only when the user explicitly asks and `allow_no_verify` is true; say so in the body.

## 2. Identity

Never pass `-c user.name`/`-c user.email`. The local git config is the identity; if unset in a fresh clone, inherit from `git log -1 --format='%an <%ae>'` and tell the user. Never invent a bot email.

## 3. Never

- One monolithic commit when groups are identifiable.
- Commit `.env`, keys, tokens.
- Push. Pushing and PRs belong to PB - Create PR, on request.
