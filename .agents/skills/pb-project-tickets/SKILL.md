---
name: pb-project-tickets
description: Linear work-item skill — query issues, projects and cycles; create issues with per-team field recipes; link related issues; bridge brain work items ↔ Linear issues with write-back of IDs into the work-item front-matter. Triggers: "linear", "create a ticket", "what's in the cycle", "link the issue", "ticket for wi-…", "update the issue".
compatibility: Linear API (GraphQL) via LINEAR_API_KEY, or the Linear MCP server / CLI if configured in tooling/mcp.example.json. Never hardcodes credentials.
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills -->

# PB - Project Tickets

## 0. Context detection (mandatory)

Read `pb.config.yaml` in the current repo root: `brain.marker: true` → brain; otherwise a pointer with `brain_path`. Load `project.md` from this skill folder if present; its keys override the defaults below. This skill works on the **current repo** (brain or project); it never writes brain-owned artifacts into a project repo.

## 1. Auth

`LINEAR_API_KEY` from the environment (`.env.example` documents it) **or** the Linear MCP server from `tooling/mcp.example.json`. If neither is available: say so, do not fake IDs; use the placeholder `<TEAM_KEY-NNN>` and leave a TODO in the work item. Until Linear exists in `pb.config.yaml` (`<LINEAR_WORKSPACE>`), everything here is dry-run.

## 2. Query recipes

See `references/linear.md` for GraphQL. Common asks: issues by state for the team, current cycle, issues referencing a brain work item (search `wi-<project>-` in description/labels), issue by id.

## 3. Create an issue from a brain work item

1. Input: a work item id. Read it from the brain; require `stage: validation` with an approved gate or `handed-off` (PB - Spec Handoff calls this).
2. Title = work item title. Description = one-paragraph intent + links: brain spec path, `brain_commit` (if any), parent epic, integrations. Labels/priority from `field_recipes[kind]`. Team from `linear_team_key`.
3. **Write back** the issue id into the work item front-matter `handoff.linear: [ABC-123]`. This is handoff metadata: allowed as a direct commit `chore(handoff): link <wi-id> artifacts` when the diff is limited to that block; otherwise PR.
4. Print the issue URL.

## 4. State ↔ stage

The mapping in `shared/delivery/linear-state-mapping.yaml` is the contract PB - Delivery Board uses. Rename states here per team in `project.md`; never invent a stage.

## 5. Never

- Transition an issue to Done, or close anything, without an explicit human instruction.
- Create brain work items from Linear (the brain is the source of intent; Linear mirrors it).
- Store the API key anywhere but the environment.
