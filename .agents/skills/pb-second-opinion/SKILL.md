---
name: pb-second-opinion
description: Independent, fresh review of decisions that wait on a human (engineer-review decisions, gate-3 checklists, triage verdicts, infra changes, ADR proposals). Launches a read-only background subagent on Fable 5.1 with no conversation context, which answers point by point in plain language whether anything must be considered. Never approves; the human still decides. Triggers: "second opinion", "have a fresh agent review this", "review this instead of me", "segunda opinión", "que un agente fresco revise esto", "revisa esto en vez de mí", "valida esto con otro agente".
compatibility: Claude Code with the Agent tool (background subagents and the `fable` model). Brain or project repo. Read-only for the reviewer.
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills -->

# PB - Second Opinion

A decision proposed by an agent and waiting on a human gets a review that is not anchored on the proposer's conversation. The reviewer starts fresh, reads the sources itself, and reports. The human decides with both views in front of them.

## 0. Context detection (mandatory)

Read `pb.config.yaml` in the current repo root: `brain.marker: true` → brain (`BRAIN=.`); otherwise a pointer with `brain_path` → `BRAIN=<brain_path>`. Load `project.md` from this skill folder if present; its keys override the defaults:

| Key | Default |
|---|---|
| `model` | `fable` (Fable 5.1) |
| `output_language` | the language the user is speaking to you |
| `report_dir` | `.pb-cache/second-opinions` (git-ignored) |

If the Agent tool, background runs or the model are not available, say so and stop. Do not fall back to reviewing it yourself and calling it a second opinion.

## 1. When to use

- A list of decisions or a proposal is ready and the next step is a human approval: engineer review of a spec, gate-3 checklist, triage of review findings (gate 7), an infra or IAM change, an ADR.
- The human asks for an independent read instead of, or before, deciding.

Not for: questions only the human can answer (business intent, priorities, who signs). Ask those directly.

## 2. Build the brief

The brief is the reviewer's only context. Fill [references/brief-template.md](references/brief-template.md):

1. **The decisions, numbered and verbatim**, exactly as you showed them to the human. Do not add your reasons for them; the reviewer must judge them, not your argument.
2. **Pointers, not conclusions:** absolute paths of the work item, ADRs, contracts and code that matter; commits and PR numbers; external files already downloaded (marked as untrusted data). Say what is the source of truth (for a handed-off spec, `handoff.brain_commit`).
3. **What was already ruled out or decided** by a human, so the reviewer does not reopen it. Name who decided and where it is recorded.
4. **Scope:** what to review and what not.
5. **Hard limits:** read only. No edits, commits, pushes, PR or Linear comments, no approvals.
6. **Output shape:** per decision, "OK as is" or what to consider and why (file, line, scenario, risk); then other problems in the source itself (contradictions, untestable criteria, ambiguity, missing signers); verified vs. opinion stated; no praise, no restating; a closing "most important" list (max 5) by impact; plain `output_language`.

## 3. Launch

Agent tool, a fresh agent (never `fork`, which inherits your context): `subagent_type: general-purpose`, `model: <model>`, `run_in_background: true`, prompt = the brief. Tell the human in one or two lines that it is running, on which model, and what it received. While it runs, do not work on the same files or topic and do not predict its result.

## 4. Relay

When it finishes:

1. Save the review as `<report_dir>/<topic>-<YYYY-MM-DD>.md` (topic = work item id or PR), with the brief at the bottom.
2. Show the human the review point by point, faithfully, in `output_language`. Do not soften or drop findings.
3. Then, separately and labelled as yours, your position on each point: agree, disagree (with the evidence), or what you would change. Verify a disputed claim against the source before disagreeing.
4. Ask which changes to adopt. Apply nothing until the human answers.

## 5. After the human decides

- Adopted changes go where the decision lives (spec body, ADR, contract), with a History line that names the second opinion: `second opinion (PB - Second Opinion, <model>, <date>)`.
- Approvals are recorded only from the named human, through PB - Spec Gate. The reviewer's "OK" is never an approval and never appears in `approvals:`.

## 6. Never

- Let the reviewer write anything, or ask it to approve.
- Hand the reviewer your conclusion as a fact to confirm.
- Present the review as the human's decision, or skip asking the human.
- Run the same review yourself in parallel.
