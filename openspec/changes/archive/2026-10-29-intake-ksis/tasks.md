# Tasks — Screen E tab 2 — KSI questions (7 Class A KSIs) with "need help" skip

> Brain work item: [[wi-maaz20x-005-intake-ksis]] · brain_commit 50fdb15cd9b3c71e2a85818932a3e17d50e3bf16 · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-005-intake-ksis.md

## 1. Setup
- [x] 1.1 Read the frozen brain spec at brain_commit 50fdb15; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-005-intake-ksis.md`)

## 2. Implement
- [x] 2.1 WHEN tab 2 opens THEN seven collapsible blocks are shown in playbook order with the KSI code and name, followed by one "Vulnerability detection" block
- [x] 2.2 WHEN a KSI block is opened THEN the KSI name and FedRAMP's statement are shown word for word from the vendored rules, with "FedRAMP rules <version>" under it, the version read from the vendored file (today 2026.10.13.01) and never written in code, before the questions
- [x] 2.3 WHEN KSI-IAM-AAM, KSI-IAM-APM or KSI-SVC-SIN is opened THEN a separate optional "How often?" line is shown with the grey line "FedRAMP expects ongoing activities to run on a known, documented cycle."; WHEN any other KSI block is opened THEN it is not
- [x] 2.4 WHEN the questions are rendered THEN their text is exactly the table in §3 (one question per block, two for KSI-IAM-APM) and intake 24 and 17 do not appear
- [x] 2.5 WHEN a block is rendered THEN its "why we ask" line is exactly Christina's customer-facing line in §3, and no Playbook "Why we ask" text appears anywhere in the customer form
- [x] 2.6 WHEN "need help" is ticked THEN the block shows "Needs help" and appears in the follow-up list on Screen D
- [x] 2.7 WHEN every question of a block has text after trimming THEN the block shows "Answered"; an optional "How often?" line and the recommended question 19 do not affect the label, and a block with only the optional "How often?" line or only question 19 filled shows "Not answered"
- [x] 2.8 WHEN some but not all questions of a block have an answer THEN the block shows "Partly answered"; WHEN nothing is filled and help is not ticked THEN "Not answered"
- [x] 2.9 WHEN "need help" is ticked on a block whose questions are all answered THEN the block shows "Needs help" and counts in both "answered" and "needs help"; WHEN only "need help" is ticked and nothing is typed THEN it counts only in "needs help"
- [x] 2.10 WHEN tab 2 is shown THEN the two counts over the seven KSI blocks appear, for example "5/7 answered, 1 needs help", and the Vulnerability detection block is not counted
- [x] 2.11 WHEN Save is clicked THEN answers, "How often?" values and flags persist per KSI and question with `rules_version` set by the server to the vendored version, and reopening the link shows them
- [x] 2.12 WHEN a save carries a key that is not in the form definition, or a value over its limit THEN the server refuses it
- [x] 2.13 WHEN Submit is clicked with unsaved tab 2 changes THEN they are saved first; WHEN that save fails or conflicts THEN Submit stops, shows it and nothing is locked
- [x] 2.14 WHEN the customer has submitted THEN tab 2 is read-only, the "need help" checkbox included, and a tab 2 save is refused; WHEN Ignyte unlocks THEN tab 2 is editable again
- [x] 2.15 WHEN Submit is clicked with empty blocks THEN Submit is not blocked by this tab, and the "Not answered" and "Needs help" blocks appear as follow-ups on Screen D, computed from the saved answers; a "Partly answered" block is not listed
- [x] 2.16 WHEN an Ignyte user opens Screen D THEN KSI-SVC-SIN shows the "CMVP validated?" control and the log-context note field, and the customer form and the customer's intake data never contain them; WHEN the customer's intake action receives those fields THEN it refuses them
- [x] 2.17 WHEN a newer rules version is vendored and a customer's saved `rules_version` is older THEN Screen D renders that customer's statements from the saved version with the note "Answered under FedRAMP rules <saved>; current rules <current>."; WHEN the customer saves again THEN `rules_version` becomes the current version
- [x] 2.18 WHEN the vendored rules file does not match its manifest hash or its schema THEN tests fail and the app refuses to start
- [x] 2.19 WHEN a Package Overview file is generated THEN its `rules_version` is the vendored rules version, not null

## 3. Verify
- [x] 3.1 Automated review (PB - Review PR) against this spec · two rounds with PB - Second Opinion (Fable 5.1) on #48, #49 and #50, reports in the brain's `.pb-cache/second-opinions/mvp-pr-4{8,9}-2026-10-29.md` and `mvp-pr-50-2026-10-29.md`; round 1: 0 blockers, 2 major (#50), round 2: all mergeable
- [x] 3.2 Human triage (gate 7) recorded in Linear IGN-27 · comment 1ba9315d (2026-10-29): fixes before merge done with tests; optional nits accepted; spec clarifications in brain #56 and #59
