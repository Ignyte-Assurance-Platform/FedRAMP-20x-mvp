# CLAUDE

<!-- PB:MANAGED:START -->
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills -->
## Project Brain (managed section)

This repo is a sub-project of **Ignyte Project Brain** at `../ignyte-project-brain` (ignyte-project-brain). The brain owns intent; this repo owns execution.

**Consult the brain first.** Context, decisions (ADRs), integration contracts, specs, harvested knowledge and the reasons behind them live in the brain, not here. Before implementing, answering a "why", or making any non-trivial choice, read the brain (project README → HUB → linked notes) and the compiled spec's brain reference. If the brain does not cover it, raise it there (note, ADR, work item); never decide it silently in code. Onboarding: `docs/onboarding/onboarding.md` in the brain.

**Spec-First Gate.** No implementation starts without an approved work-item spec in the brain. Two human gates per work item (spec, triage).

**Handoff Rule.** Approved specs are handed off frozen (`handoff.brain_commit`). Run `PB - Spec Compile` here with the work-item id; it compiles the frozen spec into `openspec/changes/<name>/` and links back. Never keep an editable copy of a spec here.

**Escalation Rule.** Any major decision found while implementing goes back to the brain: architecture change → ADR (PB - Architecture); contract change → `integration-change` work item (PB - Integration Registry); intent change → spec rework (PB - Requirements Intake). Status after handoff lives in Linear.

**Access rules.** Brain `main` accepts direct pushes only from the owner (jesusp-eng) and the designated admin (<ADMIN_HANDLE>); everyone else opens PRs. Branches: `<type>/<linear-id-or-wi-id>-<short>`.

**Skills.** Distributed from the brain's `skills/`; edit upstream, never here (only `project.md` is yours). Lock: `.pb-skills.lock`.

| Skill | Version | Purpose |
|---|---|---|
| pb-architecture | 1.0.0 | Writes ADRs, architecture views (C4-style, Mermaid) and diagram notes in the project brain |
| pb-create-pr | 1.0.1 | Opens a pull request from the current branch — checks branch naming, fills the repo PR template from the commits and the linked work item/ticket, links spec artifacts, opens as draft by default |
| pb-delivery-board | 1.0.0 | Regenerates the "work by stage" board in every projects/<p>/HUB |
| pb-documentation | 1.0.0 | Writes or updates any knowledge note in the project brain (doc, runbook, onboarding, zettel, architecture, diagram) with front-matter, TOC and links, then refreshes HUB and README |
| pb-integration-registry | 1.0.0 | Creates and maintains integration notes (one per contract between two systems) in shared/integrations/, regenerates the integration map and the HUB integration tables |
| pb-logical-commits | 1.0.1 | Turns staged/unstaged changes into focused conventional commits — groups by logical change, derives type(scope|ticket) from the diff and the branch name, presents the plan, then commits with the repo's real git identity |
| pb-mirror-file | 1.0.0 | Publishes ONE file to ONE cloud destination (e |
| pb-onboarding | 1.0.0 | Role-based onboarding to the project brain and its sibling repos — detects the role (developer, architect, PM, SME, admin), confirms the projects root, clones what is missing, runs doctor, configures the assistant and MCPs, syncs skills, explains access rules and walks through the delivery process with the seeded example, ending in a first contribution |
| pb-os-flag | 1.0.0 | Detects which workstation and operating system the current session runs on (Windows laptop, WSL, Linux, macOS) and gives the flag that commit subjects and pull-request titles and labels carry so one person's daily changes can be told apart per machine at stand-up (Windows → LP-OS by default) |
| pb-plain-language-brief | 1.0.0 | Writes and exports a fool-proof, plain-English review brief of a spec or decision for a non-technical reviewer (business owner, subject-matter expert, customer) — defines every tool, file, screen and term it mentions, shows screenshots instead of describing screens, uses the exact on-screen labels, turns every decision into a numbered Keep/Change/Remove statement, lints for jargon and symbols, and exports a Word file ready for Google Docs comments |
| pb-project-directory | 1.0.0 | Regenerates the root README project table, every projects/<p>/HUB |
| pb-project-tickets | 1.0.0 | Linear work-item skill — query issues, projects and cycles; create issues with per-team field recipes; link related issues; bridge brain work items ↔ Linear issues with write-back of IDs into the work-item front-matter |
| pb-requirements-intake | 1.0.0 | Stages 1–2 of the delivery process in the brain — Harvest every source of intent, then Draft a work-item spec from the kind template (epic, feature, bug, poc, spike, chore, tech-debt, integration-change) |
| pb-review-pr | 1.0.0 | AI review of a PR diff against the linked approved spec (does the code match intent?), project conventions, security basics and docs impact |
| pb-second-opinion | 1.0.0 | Independent, fresh review of decisions that wait on a human (engineer-review decisions, gate-3 checklists, triage verdicts, infra changes, ADR proposals) |
| pb-spec-compile | 1.0.1 | Stage 4, run INSIDE the target project repo — reads the frozen brain spec (pinned to handoff |
| pb-spec-gate | 1.0.0 | Stage 3 of the delivery process — prepares the gate-3 checklist for a work item and records the HUMAN decision (approved/rejected) in the work item's approvals |
| pb-spec-handoff | 1.0.0 | Freezes an approved work item (stage 3 passed) — verifies the approved spec gate, records handoff |
| pb-update-base-files | 1.0.0 | After meaningful changes, detects which base files (README, AGENTS/CLAUDE, CHANGELOG, onboarding, architecture overview, generated tables) need refreshing by diffing recent commits against the project's base-files list; proposes edits and applies them after confirmation |
| pb-zettel-linker | 1.0.0 | Validates and repairs the knowledge graph of the project brain — stable IDs, front-matter, TOC, [[links]], zero orphans, backlinks, ARCHIVE regeneration |

Invocation order: Zettel Linker first for any brain write · Requirements Intake → Spec Gate → Spec Handoff (brain) → Spec Compile (here) · Logical Commits → Create PR → Review PR → human triage · Update Base Files before Create PR on structural changes.
<!-- PB:MANAGED:END -->
