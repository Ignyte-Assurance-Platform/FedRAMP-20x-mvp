---
name: pb-create-pr
description: Opens a pull request from the current branch — checks branch naming, fills the repo PR template from the commits and the linked work item/ticket, links spec artifacts, opens as draft by default. Provider-agnostic, GitHub first via gh. Triggers: "create a PR", "open a pull request", "pushea y abre PR", "ready for review".
compatibility: git + GitHub CLI (gh auth login). Any repo.
version: 1.0.1
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills -->

# PB - Create PR

## 0. Context detection (mandatory)

Read `pb.config.yaml` in the current repo root: `brain.marker: true` → brain; otherwise a pointer with `brain_path`. Load `project.md` from this skill folder if present; its keys override the defaults below. This skill works on the **current repo** (brain or project); it never writes brain-owned artifacts into a project repo.

## 1. Pre-flight

1. Branch matches `branch_pattern` (`<type>/<ID>-<short>`); if not, propose a rename (`git branch -m`) and stop until confirmed.
2. Working tree clean (run PB - Logical Commits first). If the diff touches public APIs, setup, structure or `skills/`, run PB - Update Base Files first.
3. If `skills/` changed in the brain: the PR description must include the `sync-skills --dry-run` report (Skill Sync Rule).

## 2. Build the description

Use the repo's `.github/pull_request_template.md` (fallback: `references/pull_request_template.md`). Fill:
- **1 Problem**: from the work item's Scope/Harvest or the ticket title.
- **2 Validation**: from the acceptance criteria (WHEN/THEN) and `tasks.md` of the compiled change.
- **4 Ticket / work item**: Linear id from the branch; brain work item `[[wi-…]]` with its path and `brain_commit`; `handoff.spec_artifacts` paths.
- **7 Types of changes**: tick from commit types.
Mention tickets plainly; never `Fixes`/`Closes` unless the team asked.

**Workstation flag** (PB - OS Flag): run `node <skill-folder>/../pb-os-flag/scripts/detect-os.mjs`. When it returns a `marker` (Windows laptop → `[LP-OS]`), the title ends with it and the PR gets the bare flag as a label (`--label LP-OS`, created once with `gh label create` if missing). Same reason as on commits: one person's work from different machines must be tellable apart at stand-up.

## 3. Open

```bash
git push -u origin <branch>
gh pr create --base <base_branch> --draft --title "<type(scope): summary> [<flag>]" --label <flag> --body-file <tmp>   # flag parts only when PB - OS Flag returns one
```
Omit `--draft` only if the user says the PR is ready. Add `reviewers` from `project.md`. Print the URL. Then hand to PB - Review PR when the user wants an AI review.

## 4. Never

- Merge, approve, or mark ready for review on your own.
- Push to `main`.
- Open a PR for a work item still in stages 1–3 without saying it is a docs-only PR to the brain.
