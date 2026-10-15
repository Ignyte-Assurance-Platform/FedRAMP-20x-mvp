---
name: pb-plain-language-brief
description: Writes and exports a fool-proof, plain-English review brief of a spec or decision for a non-technical reviewer (business owner, subject-matter expert, customer) — defines every tool, file, screen and term it mentions, shows screenshots instead of describing screens, uses the exact on-screen labels, turns every decision into a numbered Keep/Change/Remove statement, lints for jargon and symbols, and exports a Word file ready for Google Docs comments. Triggers: "brief for Max/Christina", "plain English", "non-technical reviewer", "make it easy to understand", "a prueba de bobos", "review copy for the business", "send this spec to <non-technical person>".
compatibility: Node >= 18, pandoc (or PANDOC env var pointing to a pandoc binary), optional Mermaid CLI (mmdc), optional Chrome/Chromium for screenshots. Writes brain notes only.
version: 1.0.0
---
<!-- managed by ignyte-project-brain — edit upstream in skills/ and re-run scripts/sync-skills -->

# PB - Plain-Language Brief

A brief is the version of a spec that a non-technical person can approve **without imagining anything**. The technical spec stays the source of truth for engineers; the brief is what the business reviewer reads and answers.

## 0. Context detection (mandatory)

Read `pb.config.yaml`: `brain.marker: true` → brain; otherwise a pointer with `brain_path`. Briefs are brain notes (`projects/<p>/docs/<p>-brief-<nnn>-<short>.md`). Load `project.md` from this skill folder if present (extra banned words, author name, default mockup paths). PB - Zettel Linker runs before writing, as for any note.

## 1. Inputs

1. The source: a work item, ADR or plan section. Read it **fully**, including acceptance criteria and open questions.
2. The reviewer: name and what they know. Assume they have **never seen** the tool, the mockup, our notes or the spec.
3. The project's plain glossary `projects/<p>/docs/<p>-plain-glossary.md`. Create it if missing (one row per tool, file, screen or term: plain meaning, who made it, where to see it, whether it is real yet). Reuse its wording in every brief so terms mean the same everywhere.

## 2. Write the brief

Copy `references/template.md`. Follow every rule in `references/rules.md`. In short:

- **Words used in this document** comes first: every named thing the brief mentions, with what it is, where to find it and whether it exists yet.
- **What it looks like**: a screenshot per screen discussed (`scripts/screenshot.mjs`), each with a caption saying which screen, which mockup, what to look at, what to ignore, and where the real tool will differ.
- **What we will build**: one decision per numbered point, two sentences at most, each answerable with Keep / Change / Remove. Use the exact button and field labels shown on screen, in quotes.
- **Not in this first version**, **Questions for you** (each answerable without research, with options and the default if they do not answer), **How to answer**.
- **Coverage** (brain only, removed on export): a table mapping every behaviour and acceptance criterion of the source to a numbered point or to "Not in this first version". Nothing in the source may be left unmapped.

## 3. Check it

1. `node skills/pb-plain-language-brief/scripts/lint-brief.mjs <brief.md> [...]` — fails on banned technical words, shorthand symbols, missing sections, glossary terms used but not defined in "Words used", and missing screenshots files.
2. Walk `references/checklist.md` yourself. Then read the brief as the reviewer: if any sentence needs knowledge they do not have, fix it.

## 4. Export

`node skills/pb-plain-language-brief/scripts/export-docx.mjs --out <folder> <brief.md> [...]` produces `<export_name>__REVIEW_<audience>.docx`: title, "For <audience> · prepared by <author> · <date>", the brief without the table of contents, Related and Coverage sections, screenshots embedded, and a decision box. Wiki links become note titles. Review the first page rendered before sending.

## 5. After sending

Record where it went in the review pack note. When the answers come back, apply them to the **source spec** (never to the Word copy), add a History line, then record the gate decision with PB - Spec Gate.

## 6. Never

- Send a technical spec to a non-technical reviewer instead of a brief.
- Use a word for two different things (for example "tab" for a screen section and for a spreadsheet tab).
- Describe a screen without showing it, or show a mockup that differs from what we will build without saying so next to the picture.
- Leave a decision of the source out of the brief, or add a decision that is not in the source.
