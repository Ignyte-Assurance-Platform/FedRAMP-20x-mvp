---
name: pb-onboarding
description: Role-based onboarding to the project brain and its sibling repos — detects the role (developer, architect, PM, SME, admin), confirms the projects root, clones what is missing, runs doctor, configures the assistant and MCPs, syncs skills, explains access rules and walks through the delivery process with the seeded example, ending in a first contribution. Triggers: "onboard me", "I'm new", "how do I start", "set up my machine", "day 1".
compatibility: Node >= 18, git, gh. Works from the brain or from a project repo.
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills -->

# PB - Onboarding

## 0. Context detection (mandatory)

Read `pb.config.yaml`: `brain.marker: true` → brain; otherwise pointer with `brain_path`. If the brain is missing, step 2 below clones it; this is the one skill allowed to start without it. Load `project.md` if present.

## 1. Detect the role

Ask one question if not obvious: "Will you implement code, make architecture decisions, review specs as a domain expert, read status, or administer the brain?" Map to `docs/onboarding/onboarding-<role>.md` and follow it alongside the flow below. Non-technical (PM) and SME paths stop after step 6 and get the no-git instructions from their guide.

## 2. Projects root and clones

Ask for and confirm the projects root (default: the parent of the current repo). Clone the brain (`pb.config.yaml` → `brain.repo_name`; URL from the user or `git.org`) and the sibling repos the person works on (`pb.config.yaml` `projects[].repo`, `project.md` `sibling_repos`). Skip repos that already exist. Never nest a project inside the brain.

## 3. Tools

Run `node $BRAIN/scripts/doctor.mjs`. For each FAIL show the fix from `tooling/README.md` for the person's OS. Do not install anything yourself.

## 4. Assistant and MCPs

Point to `.claude/skills/` (brain and project). Copy `tooling/mcp.example.json` into the agent's MCP config; `LINEAR_API_KEY` in the environment per `.env.example`. Confirm `gh auth status`.

## 5. Skills in the projects

`node $BRAIN/scripts/sync-skills.mjs --dry-run`, then `--project <name>` for each project the person works on; they commit in the project repo (PB - Logical Commits), on a branch unless they are owner/admin.

## 6. Access rules

Explain: owner + admin push to `main`; everyone else branches `<type>/<ID>-<short>` and opens PRs with the template; CODEOWNERS on sensitive paths; the Handoff Metadata Exception. Source: `AGENTS.md` §4.

## 7. Walk the process with the seeded example

Open `projects/maaz20x/work-items/wi-maaz20x-004-intake-company-service.md` and the HUB board. Show: the two human gates (approvals list, gate 7 in Linear), brain vs project boundary (stages 1–3 here, 4–8 in `FedRAMP-20x-mvp` + Linear), Handoff (`handoff.brain_commit`) and Escalation rules, where to read status (HUB board row, Linear). Say explicitly that the approval in the example is simulated.

## 8. First contribution

A small docs change in the brain: zettel or typo → PB - Logical Commits → PB - Create PR (draft) → PB - Review PR → a human triages. Done when the PR is open.

## 9. Never

- Install tools silently, store keys in files, or push for the person.
- Skip the access-rules step.
