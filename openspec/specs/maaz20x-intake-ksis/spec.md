# maaz20x-intake-ksis Specification

## Purpose
Tab 2 of the customer intake (Screen E): the seven Class A KSIs with FedRAMP's statement and rules version from the vendored rules, free-text answers, a "need help" skip and per-block status, plus the Vulnerability detection block; read-only on Screen D with live follow-ups and the consultant's CMVP and log-context fields. Source: brain work item [[wi-maaz20x-005-intake-ksis]] at brain_commit 50fdb15; archived change `2026-10-29-intake-ksis`.

## Requirements

### Requirement: Screen E tab 2 — KSI questions (7 Class A KSIs) with "need help" skip

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-005-intake-ksis]] at brain_commit 50fdb15; scope in proposal.md).

#### Scenario: tab 2 opens
- **WHEN** tab 2 opens
- **THEN** seven collapsible blocks are shown in playbook order with the KSI code and name, followed by one "Vulnerability detection" block

#### Scenario: a KSI block is opened
- **WHEN** a KSI block is opened
- **THEN** the KSI name and FedRAMP's statement are shown word for word from the vendored rules, with "FedRAMP rules <version>" under it, the version read from the vendored file (today 2026.10.13.01) and never written in code, before the questions

#### Scenario: KSI-IAM-AAM, KSI-IAM-APM or KSI-SVC-SIN is opened
- **WHEN** KSI-IAM-AAM, KSI-IAM-APM or KSI-SVC-SIN is opened
- **THEN** a separate optional "How often?" line is shown with the grey line "FedRAMP expects ongoing activities to run on a known, documented cycle."; WHEN any other KSI block is opened THEN it is not

#### Scenario: the questions are rendered
- **WHEN** the questions are rendered
- **THEN** their text is exactly the table in §3 (one question per block, two for KSI-IAM-APM) and intake 24 and 17 do not appear

#### Scenario: a block is rendered
- **WHEN** a block is rendered
- **THEN** its "why we ask" line is exactly Christina's customer-facing line in §3, and no Playbook "Why we ask" text appears anywhere in the customer form

#### Scenario: "need help" is ticked
- **WHEN** "need help" is ticked
- **THEN** the block shows "Needs help" and appears in the follow-up list on Screen D

#### Scenario: every question of a block has text after trimming
- **WHEN** every question of a block has text after trimming
- **THEN** the block shows "Answered"; an optional "How often?" line and the recommended question 19 do not affect the label, and a block with only the optional "How often?" line or only question 19 filled shows "Not answered"

#### Scenario: some but not all questions of a block have an answer
- **WHEN** some but not all questions of a block have an answer
- **THEN** the block shows "Partly answered"; WHEN nothing is filled and help is not ticked THEN "Not answered"

#### Scenario: "need help" is ticked on a block whose questions are all answered
- **WHEN** "need help" is ticked on a block whose questions are all answered
- **THEN** the block shows "Needs help" and counts in both "answered" and "needs help"; WHEN only "need help" is ticked and nothing is typed THEN it counts only in "needs help"

#### Scenario: tab 2 is shown
- **WHEN** tab 2 is shown
- **THEN** the two counts over the seven KSI blocks appear, for example "5/7 answered, 1 needs help", and the Vulnerability detection block is not counted

#### Scenario: Save is clicked
- **WHEN** Save is clicked
- **THEN** answers, "How often?" values and flags persist per KSI and question with `rules_version` set by the server to the vendored version, and reopening the link shows them

#### Scenario: a save carries a key that is not in the form definition, or a value over its limit
- **WHEN** a save carries a key that is not in the form definition, or a value over its limit
- **THEN** the server refuses it

#### Scenario: Submit is clicked with unsaved tab 2 changes
- **WHEN** Submit is clicked with unsaved tab 2 changes
- **THEN** they are saved first; WHEN that save fails or conflicts THEN Submit stops, shows it and nothing is locked

#### Scenario: the customer has submitted
- **WHEN** the customer has submitted
- **THEN** tab 2 is read-only, the "need help" checkbox included, and a tab 2 save is refused; WHEN Ignyte unlocks THEN tab 2 is editable again

#### Scenario: Submit is clicked with empty blocks
- **WHEN** Submit is clicked with empty blocks
- **THEN** Submit is not blocked by this tab, and the "Not answered" and "Needs help" blocks appear as follow-ups on Screen D, computed from the saved answers; a "Partly answered" block is not listed

#### Scenario: an Ignyte user opens Screen D
- **WHEN** an Ignyte user opens Screen D
- **THEN** KSI-SVC-SIN shows the "CMVP validated?" control and the log-context note field, and the customer form and the customer's intake data never contain them; WHEN the customer's intake action receives those fields THEN it refuses them

#### Scenario: a newer rules version is vendored and a customer's saved `rules_version` is older
- **WHEN** a newer rules version is vendored and a customer's saved `rules_version` is older
- **THEN** Screen D renders that customer's statements from the saved version with the note "Answered under FedRAMP rules <saved>; current rules <current>."; WHEN the customer saves again THEN `rules_version` becomes the current version

#### Scenario: the vendored rules file does not match its manifest hash or its schema
- **WHEN** the vendored rules file does not match its manifest hash or its schema
- **THEN** tests fail and the app refuses to start

#### Scenario: a Package Overview file is generated
- **WHEN** a Package Overview file is generated
- **THEN** its `rules_version` is the vendored rules version, not null
