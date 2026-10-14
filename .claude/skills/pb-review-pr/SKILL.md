---
name: pb-review-pr
description: AI review of a PR diff against the linked approved spec (does the code match intent?), project conventions, security basics and docs impact. Produces a findings report for the human triage gate (stage 7). Never approves or merges. Triggers: "review this PR", "review the diff", "findings for PR #…", "stage 6".
compatibility: git + gh (gh pr diff). Any repo. Read-only on the PR; may post a comment only if asked.
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills -->

# PB - Review PR

## 0. Context detection (mandatory)

Read `pb.config.yaml` in the current repo root: `brain.marker: true` → brain; otherwise a pointer with `brain_path`. Load `project.md` from this skill folder if present; its keys override the defaults below. This skill works on the **current repo** (brain or project); it never writes brain-owned artifacts into a project repo.

## 1. Inputs

- The diff: `gh pr diff <n>` (or `git diff <base>...HEAD`).
- The intent: the brain work item named in the PR body / branch; read it **at `handoff.brain_commit`** (`git -C $BRAIN show <commit>:<path>`) and the compiled `openspec/changes/<name>/` if present.
- Conventions: `conventions_doc`; security: `references/security-basics.md`.

## 2. Review dimensions

1. **Intent match** — each acceptance criterion: implemented / partial / missing / contradicted. A contradiction is an *intent defect* candidate → flag for escalation (back to stage 2), never suggest editing the spec in the project repo.
2. **Correctness** — bugs, edge cases, error handling, data integrity.
3. **Security basics** — secrets, injection, authz on every route, uploads, tokens, logging of PII.
4. **Conventions** — structure per `conventions_doc`, naming, tests present for changed behaviour.
5. **Docs impact** — does a base file need updating (README, AGENTS/CLAUDE managed section, CHANGELOG, onboarding, architecture)? Point to PB - Update Base Files.

## 3. Output — findings report

Write `<report_dir>/pr-<n>-<date>.md`:

```
# Findings — PR #<n> · <title> · spec [[wi-…]]@<brain_commit>
| # | Severity (blocker/major/minor/nit) | Dimension | File:line | Finding | Suggested action |
Summary: criteria met x/y · blockers n · intent defects n
```
Post as a PR comment only if the user asks. The decision on every finding is the human's (gate 7) and is recorded in Linear, not here.

## 4. Never

- Approve, request changes as a formal review, or merge.
- Patch the code or the spec yourself.
- Hide a finding because it is uncomfortable.
