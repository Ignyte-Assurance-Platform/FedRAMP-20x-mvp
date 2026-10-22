# Tasks — Screen D — generate, validate and download the Package Overview JSON

> Brain work item: [[wi-maaz20x-007-package-overview-json]] · brain_commit 0aa195347a95be589ff132ffeb6428df3365c41d · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-007-package-overview-json.md

## 1. Setup
- [x] 1.1 Read the frozen brain spec at brain_commit 0aa1953; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-007-package-overview-json.md`)

## 2. Implement
- [x] 2.1 WHEN the golden answers are present with a fixed logo URL and the default advisor THEN Generate JSON reports 0 errors and the stored JSON deep-equals the golden fixture (key order ignored), and the download is named `ERP-package-overview.json`
- [x] 2.2 WHEN each fault that this item owns is injected THEN validation reports it at the path in the table below; the faults owned by wi-004 are covered by wi-004's tests
- [x] 2.3 WHEN a contact phone is `(800) 555-0199 ext. 42` or `+1 202.555.0123` THEN validation reports no phone error
- [x] 2.4 WHEN the form is blank THEN validation lists every missing required field by its question name and the only download offered is `<acronym>-package-overview-DRAFT.json` (or generation is refused when the acronym itself is missing)
- [x] 2.5 WHEN the next ongoing certification report date is today or earlier (America/New_York) THEN validation reports it and the file is a draft
- [x] 2.6 WHEN a field has a form label THEN its error uses that label; WHEN it has none THEN the schema `title` is used; no per-field message text exists in application code
- [x] 2.7 WHEN a rule type has no message pattern THEN the generic fallback sentence is shown
- [x] 2.8 WHEN a file is generated THEN `schema_version` equals the vendored schema's `$schemaVersion`, `schema_commit` comes from the manifest, `rules_version` is stored (null until rules are vendored), and no version literal exists in application code
- [x] 2.9 WHEN the vendored schema version is raised THEN customers whose latest file used the older version show the "Regenerate" flag on Screen D, and the flag clears after regenerating (the flag in the customers list follows when [[wi-maaz20x-003-customers-list-and-create]] ships)
- [x] 2.10 WHEN answers change after a generation THEN Download still serves the stored file and Screen D shows "Answers changed since this file was generated"
- [x] 2.11 WHEN the customer listed advisor "Ignyte" on tab 1 and the Advisor box says "Ignyte" THEN `advisors` contains "Ignyte" once; WHEN the box is emptied and the customer listed none THEN the JSON has no `advisors`
- [x] 2.12 WHEN the same inputs and versions are generated twice THEN the two JSON files are identical byte for byte (stable key order)
- [x] 2.13 WHEN a customer link token calls any route of this item THEN it is refused
- [x] 2.14 WHEN an assessor name is entered and "Assessor Confirmed on FedRAMP Marketplace" is not ticked THEN the file is a draft with a problem naming the assessor; WHEN it is ticked THEN Screen D shows who ticked it and the date; WHEN the assessor name or ID changes THEN the tick is cleared
- [x] 2.15 WHEN the Ignyte-hosted logo URL does not answer with an image THEN the file is a draft with a problem naming the logo
- [x] 2.16 WHEN a file is shown on Screen D THEN its schema version, rules version and creation date and time are shown next to it
- [x] 2.17 WHEN the latest file is valid THEN the Publishing checklist with the five FRC-CSO-JSN items is shown next to it; WHEN it is a draft THEN the checklist is not shown
- [x] 2.18 WHEN the file is a draft THEN the button reads "Download draft" and the file is named `<acronym>-package-overview-DRAFT.json`

## 3. Verify
- [ ] 3.1 Automated review (PB - Review PR) against this spec
- [ ] 3.2 Human triage (gate 7) recorded in Linear IGN-8
