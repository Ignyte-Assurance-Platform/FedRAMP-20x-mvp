# Tasks — Screen D — generate, validate and download the Package Overview JSON

> Brain work item: [[wi-maaz20x-007-package-overview-json]] · brain_commit 424d93a75b8261c8c4c4305da5f7b97d2c5c3fa5 · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-007-package-overview-json.md

## 1. Setup
- [ ] 1.1 Read the frozen brain spec at brain_commit 424d93a; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-007-package-overview-json.md`)

## 2. Implement
- [ ] 2.1 WHEN the golden answers are present with a fixed logo URL and the default advisor THEN Generate JSON reports 0 errors and the stored JSON deep-equals the golden fixture (key order ignored), and the download is named `ERP-package-overview.json`
- [ ] 2.2 WHEN each fault that this item owns is injected THEN validation reports it at the path in the table below; the faults owned by wi-004 are covered by wi-004's tests
- [ ] 2.3 WHEN a contact phone is `(800) 555-0199 ext. 42` or `+1 202.555.0123` THEN validation reports no phone error
- [ ] 2.4 WHEN the form is blank THEN validation lists every missing required field by its question name and the only download offered is `DRAFT-<acronym>-package-overview.json` (or generation is refused when the acronym itself is missing)
- [ ] 2.5 WHEN the next ongoing certification report date is today or earlier (America/New_York) THEN validation reports it and the file is a draft
- [ ] 2.6 WHEN a field has a form label THEN its error uses that label; WHEN it has none THEN the schema `title` is used; no per-field message text exists in application code
- [ ] 2.7 WHEN a rule type has no message pattern THEN the generic fallback sentence is shown
- [ ] 2.8 WHEN a file is generated THEN `schema_version` equals the vendored schema's `$schemaVersion`, `schema_commit` comes from the manifest, `rules_version` is stored (null until rules are vendored), and no version literal exists in application code
- [ ] 2.9 WHEN the vendored schema version is raised THEN customers whose latest file used the older version show the "Regenerate" flag on Screen D, and the flag clears after regenerating (the flag in the customers list follows when [[wi-maaz20x-003-customers-list-and-create]] ships)
- [ ] 2.10 WHEN answers change after a generation THEN Download still serves the stored file and Screen D shows "Answers changed since this file was generated"
- [ ] 2.11 WHEN the customer listed advisor "Ignyte" on tab 1 and the Advisor box says "Ignyte" THEN `advisors` contains "Ignyte" once; WHEN the box is emptied and the customer listed none THEN the JSON has no `advisors`
- [ ] 2.12 WHEN the same inputs and versions are generated twice THEN the two JSON files are identical byte for byte (stable key order)
- [ ] 2.13 WHEN a customer link token calls any route of this item THEN it is refused

## 3. Verify
- [ ] 3.1 Automated review (PB - Review PR) against this spec
- [ ] 3.2 Human triage (gate 7) recorded in Linear 
