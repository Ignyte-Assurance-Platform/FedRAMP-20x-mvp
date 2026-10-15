# Rules — fool-proof plain-language briefs

The reader is smart, busy and not technical. They have never seen our tool, our mockups, our notes or the spec. If a sentence needs any of that to be understood, it is wrong.

## 1. Nothing is left to imagination

1. **Define every named thing on first use** in "Words used in this document": tools (ours and theirs), files, folders, spreadsheets and their tabs, screens, buttons, people's work, versions, external sites. For each: what it is in one plain sentence, who made it, where to see it (a link, or the exact place: "the 'Intake' tab of your Consultant Playbook spreadsheet"), and whether it exists yet or is being built.
2. **One word, one meaning.** If two things share a name, rename one in the brief and say so. Example: "tab" means one of the section buttons at the top of the customer form; a spreadsheet tab is always written as "the 'Intake' sheet tab of …".
3. **Show, do not describe.** Every screen the brief talks about gets a screenshot. The caption says: which screen, from which mockup (with link), what to look at, what to ignore (for example the yellow note bar of the mockup), and that the example data is made up.
4. **Say where the mockup is wrong.** If the real tool will differ from the mockup (a button renamed, a field added, a screen replaced), say it right next to the screenshot. Never let the reader discover it.
5. **Use the exact on-screen labels**, in quotes: "Generate JSON", "Submit to Ignyte", "Security indicators". If a label will change, give both: today "Generate JSON", will become "…".
6. **Name their own work exactly.** Not "your intake" but "the numbered questions in the 'Intake' sheet tab of your Consultant Playbook spreadsheet". Not "your converter" but "the Python converter in your Drive folder '~FedRAMP Schemas and CR26'".
7. **Point to things in the order the reader will meet them** (screen order, then tab order, then field order).

## 2. Plain words only

8. No technical words. Banned list in `scripts/lint-brief.mjs` (database, token, bucket, server, API, deploy, repository, schema validation, frontend, backend, cache, endpoint…). Say what it does for them instead: "a long random web address nobody can guess", "kept privately in Ignyte's Google Cloud".
9. A domain word the reader uses daily (KSI, Package Overview, Trust Center, SAR) is fine, but still goes in "Words used" with its plain meaning.
10. No symbols as shorthand: no arrows, slashes for "or", ampersands, plus signs, brackets, code formatting, emoji. Write the words.
11. No acronym without its expansion, unless it is defined in "Words used".
12. Absolute dates ("15 October 2026"), numbers with units ("up to 100 MB per file", "8 hours").

## 3. Easy to answer

13. **One decision per numbered point**, two sentences at most, answerable with Keep, Change or Remove.
14. **Questions** must be answerable without research. Offer the options ("A or B?") and say what we do if they do not answer ("If we do not hear back, we use A").
15. Say what is **not** in this version, so silence is not read as a promise.
16. Tell them how long it takes and what we need, at the top.

## 4. Faithful to the source

17. **Coverage table** (kept in the brain, removed on export): every behaviour, rule and acceptance criterion of the source maps to a numbered point or to "Not in this first version". Nothing left out, nothing added.
18. Answers go back into the source spec, never into the Word copy.
