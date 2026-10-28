# Tasks — Screen E tab 1 — Company & service intake generated from the Package Overview schema

> Brain work item: [[wi-maaz20x-004-intake-company-service]] · brain_commit 68881d9cc32a5a2603e01d2b0268bb38038d1f76 · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-004-intake-company-service.md

## 1. Setup
- [x] 1.1 Read the frozen brain spec at brain_commit 68881d9; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-004-intake-company-service.md`)

## 2. Implement
- [x] 2.1 WHEN the intake link is opened without a session THEN tab 1 renders with the customer's company and service name in the header
- [x] 2.2 WHEN the vendored Package Overview schema has a required field THEN the form marks it required and Submit is blocked while it is empty
- [x] 2.3 WHEN an enumerated field is shown THEN its options are exactly the schema strings (e.g. "Artificial Intelligence (AI)", "Government Community Cloud")
- [x] 2.4 WHEN Trust Center has authenticationRequired true and no accessRequestInstructions THEN Submit shows an error on that group
- [x] 2.5 WHEN Save is clicked THEN the partial object is stored with its `form_definition_version` and a bumped `version`, the form definition's schema version and commit equal those read from the vendored manifest (no literals), and the customer status becomes In progress
- [x] 2.6 WHEN the link is reopened after Save THEN every saved answer is shown
- [x] 2.7 WHEN Submit succeeds THEN tabs 1 and 2 are read-only, tab 3 still accepts files, and the customer status is Submitted (tab 3 landed with wi-006, IGN-24: smoke "IGN-16 2.7 after Submit tab 1 is read-only and tab 3 still accepts files")
- [x] 2.8 WHEN Ignyte unlocks the customer THEN the link is editable again and status returns to In progress
- [x] 2.9 WHEN the golden example values (`server/fedramp/testdata/golden-answers.json`) are entered THEN tab 1 submits with zero validation errors
- [x] 2.10 WHEN a PNG logo of 300 px width and 500 KB is uploaded THEN a preview is shown, the file is stored on Ignyte's side and the generated JSON uses the Ignyte-hosted URL as `serviceIdentification.logo`
- [x] 2.11 WHEN a 3 MB logo, an SVG or a WebP is uploaded THEN it is rejected before upload with the instructions shown
- [x] 2.12 WHEN a file renamed to .png that is not a PNG reaches the bucket THEN the finish check deletes it and nothing is recorded
- [x] 2.13 WHEN no logo is uploaded THEN Submit is blocked with an error naming the logo
- [x] 2.14 WHEN the certification type is 20x THEN no class picker is shown, the customer record stores `fedramp_class = "A"`, and Screen D shows "Class A" as read-only text next to the certification type
- [x] 2.15 WHEN the package ID is left empty THEN Submit is not blocked by it, the box shows "<provider name> <service acronym>" (for example "Example Cloud Co. ERP") with the note "Filled in automatically until FedRAMP assigns your ID", and nothing is stored for the field; WHEN a value is typed THEN the note disappears and the typed value is stored
- [x] 2.16 WHEN the contacts list has no Security contact or no Sales contact THEN Submit is blocked with an error on the Contacts section, built from the schema rule and the tab 1 label; WHEN both are present THEN that check passes
- [x] 2.17 WHEN the customer stops typing for 2 seconds THEN the draft is saved without pressing Save and the status becomes In progress on the first autosave; the Save button still works
- [x] 2.18 WHEN the UEI box is filled THEN the stored object and the generated file contain `serviceIdentification.ueiNumber`; WHEN it is empty THEN the key is absent
- [x] 2.19 WHEN tab 1 is rendered THEN the third-party section is labelled "Third-party information resources within the Minimum Assessment Scope"
- [x] 2.20 WHEN two windows edit tab 1 and the second saves with an older version THEN it gets a conflict, the stored answers are unchanged, and the customer chooses Keep mine or Take theirs (server conflict and Keep mine smoke-tested; the page's save ordering unit-tested in intake-saver.test.ts; the Keep mine / Take theirs buttons are not tested in a browser)
- [x] 2.21 WHEN the code is built THEN no write to `intake_answers` happens without a version check (`upsertIntakeSection` removed)
- [x] 2.22 WHEN the browser posts `serviceIdentification.logo` or `assessor` THEN neither is stored
- [x] 2.23 WHEN Save, autosave, Submit or a logo upload uses an expired or replaced token THEN nothing is stored and the expired page is shown; WHEN tabs 1 and 2 are Submitted THEN autosave and Save are refused
- [x] 2.24 WHEN a staff session opens `/intake/<token>` without a valid token THEN nothing is shown
- [x] 2.25 WHEN the provider name or acronym changes and the package ID is empty THEN the shown fallback follows; WHEN either is empty THEN no value and no note are shown
- [x] 2.26 WHEN a question has a line in the "Why we ask (client)" column THEN it is shown under the question word for word; WHEN the column says "—" THEN nothing is shown
- [x] 2.27 WHEN a customer is created on Screen C THEN tab 1 starts with the provider name, service name and description typed there
- [x] 2.28 WHEN tab 1's labels are published THEN Screen D names a tab 1 problem with the same label the customer sees

## 3. Verify
- [ ] 3.1 Automated review (PB - Review PR) against this spec
- [ ] 3.2 Human triage (gate 7) recorded in Linear 
