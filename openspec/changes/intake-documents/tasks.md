# Tasks — Screen E tab 3 — document upload to the private bucket

> Brain work item: [[wi-maaz20x-006-intake-documents]] · brain_commit af98c57a31cf67d1c4ae3d3af4c1ed0020914e43 · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-006-intake-documents.md

## 1. Setup
- [x] 1.1 Read the frozen brain spec at brain_commit af98c57; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-006-intake-documents.md`)

## 2. Implement
- [x] 2.1 WHEN the customer picks SOC 2 Type II THEN the list shows the SOC 2 items and the "Everyone" items, and the "Expected date of the next report" date field
- [x] 2.2 WHEN the customer picks FedRAMP Ready or GovRAMP THEN the list shows Readiness Assessment Report and Security Assessment Plan plus the "Everyone" items
- [x] 2.3 WHEN the customer picks FedRAMP Rev 5 (authorized) THEN the list shows "Previous FedRAMP package and SAR" plus the "Everyone" items
- [x] 2.4 WHEN the period end date is more than 12 months ago THEN a warning citing FRC-CLA-ASF is shown on the tab and on Screen D, and Save and Submit still work
- [x] 2.5 WHEN a 250 MB PDF is dropped THEN it uploads straight to the bucket in a resumable session and appears in the list
- [x] 2.6 WHEN the connection drops halfway through an upload and comes back THEN the upload continues from where it stopped, not from the start
- [x] 2.7 WHEN an upload is started but never finished THEN no row is written and nothing appears in either list
- [x] 2.8 WHEN a finished upload fails the type, size or signature check THEN its object is deleted and no row is written
- [x] 2.9 WHEN a 251 MB file, a .zip or an .exe is dropped THEN it is refused before upload with the matching message
- [x] 2.10 WHEN a PNG, SVG, VSDX, CSV, JSON or XML file is dropped THEN it is accepted
- [x] 2.11 WHEN a file has no "What is this?", or a policy file has no version or last-updated date THEN Submit is blocked with the file named
- [x] 2.12 WHEN the customer renames a file THEN only the display name changes and the download still returns the original object
- [x] 2.13 WHEN the customer replaces a file THEN they see only the new version and Ignyte sees "replaced on [date]" with both versions downloadable
- [x] 2.14 WHEN the customer has submitted THEN tabs 1 and 2 are read-only, tab 3 still accepts uploads, renames and replacements, and the x is not shown
- [x] 2.15 WHEN a file is uploaded after Submit THEN Screen D labels it "added after submission"
- [x] 2.16 WHEN Screen D opens THEN each listed item shows a check if a current file has that kind, and "missing" otherwise
- [x] 2.17 WHEN Ignyte removes a file THEN it disappears from both sides and the object stays in the bucket

## 3. Verify
- [ ] 3.1 Automated review (PB - Review PR) against this spec
- [ ] 3.2 Human triage (gate 7) recorded in Linear 
