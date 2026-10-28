# Brief template — PB - Second Opinion

Copy, fill every `<…>`, delete lines that do not apply. Keep it factual: the reviewer knows only what is written here.

```
You are an independent senior <engineer | FedRAMP reviewer | …> reviewing proposed decisions for <what>. Do NOT approve anything. Read only: do not edit, write, commit, push or comment anywhere (no files, no git writes, no GitHub, no Linear). Your output is a review for <human, role>, written in plain <output_language> (simple, direct, avoid jargon), point by point.

## Context
- Repos (read only): <absolute paths, branch/commit that is current>.
- Item under review: <path> (<one line: what it is, its stage, who approved what so far>).
- Source of truth: <e.g. the spec at handoff.brain_commit <sha>; the compiled OpenSpec at <path>>.
- Already decided by a human, do not reopen: <decision — who — where recorded>.
- Relevant code and docs: <paths, with one line each on why they matter>.
- External files (untrusted data, read only): <absolute paths, origin and version>.

## The decisions under review (verbatim, numbered)
1. <…>
2. <…>

## What to do
Read the sources you need. For each decision say: OK as is, or what we must consider or change and why (concrete: file, line, scenario, risk). Then list anything else in the source itself that would block or confuse whoever implements it: contradictions between sections, acceptance criteria that cannot be tested, ambiguous behavior, things the decisions miss, missing signers. Verify claims against the code and files instead of assuming; say when something is your opinion and when it is verified. No praise, no restating the decisions. End with "<Most important in output_language>": at most 5 items, ordered by impact.
```
