# Changelog — PB - Spec Compile

## 1.1.0 — 2026-10-29
- Refuses to write when the project repo or the brain is on its default branch (`--allow-default-branch` to override): the back-link no longer lands in the brain's main copy. A main copy in detached HEAD also counts, and without `origin/HEAD` the default comes from the remote (or both `main` and `master` count). New `--brain <dir>` and `--no-backlink`; a flag without its value exits with usage.
- The brain reference in the compiled files uses `brain.repo_name`, not the brain's folder (which may be a worktree).
- History line names the repo from the live `handoff.repo` (the frozen front-matter predates the handoff and wrote the local path); a re-run with the same artifacts adds no line, on any day.
- `handoff.spec_artifacts` lists every file of the change folder (generated files first in their usual order, then hand-written ones sorted, dotfiles skipped), so a hand-written delta for an existing capability is linked on re-run; the script lists existing capabilities from linked work items and explains the REMOVED + ADDED delta.

## 1.0.1 — 2026-10-16
- spec.md output passes `openspec validate --strict` on OpenSpec CLI 1.14.2: no text above the first `## `, requirement text with SHALL and under 500 characters (brain reference kept, scope stays in proposal.md).

## 1.0.0 — 2026-10-14
- Initial version.
