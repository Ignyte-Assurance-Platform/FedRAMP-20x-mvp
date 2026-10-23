# Tasks — Screens B and C — customers list and create customer with intake link

> Brain work item: [[wi-maaz20x-003-customers-list-and-create]] · brain_commit a739b08ecff5ee0a226492e0951aa702516032dd · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-003-customers-list-and-create.md

## 1. Setup
- [ ] 1.1 Read the frozen brain spec at brain_commit a739b08; confirm nothing changed upstream (`git log -1 -- projects/maaz20x/work-items/wi-maaz20x-003-customers-list-and-create.md`)

## 2. Implement
- [ ] 2.1 WHEN a customer is saved THEN an intake link with a 32-character random token is generated and shown, and the database holds only its hash and its encrypted form
- [ ] 2.2 WHEN the list loads THEN every customer shows its status and a working Copy link
- [ ] 2.3 WHEN a required field is empty THEN Save is blocked and the field is marked
- [ ] 2.4 WHEN the customer first saves the intake THEN the status in Screen B changes to In progress
- [ ] 2.5 WHEN the customer submits THEN the status changes to Submitted and the link is read-only
- [ ] 2.6 WHEN Unlock is clicked on a Submitted customer THEN status returns to In progress and the link is editable again
- [ ] 2.7 WHEN two customers are created THEN their tokens differ and both match `^[A-Za-z0-9_-]{32}$`; the generator uses the crypto RNG (unit test)
- [ ] 2.8 WHEN a link is opened 30 days or more after it was issued THEN the form is not shown and the page says "This link has expired. Ask your Ignyte consultant for a new one."
- [ ] 2.9 WHEN "Issue new link" is clicked on Screen D THEN a new token is generated, the old link stops working at once, and the new link is shown with Copy
- [ ] 2.10 WHEN a link is re-issued THEN saved answers, documents, status and lock are untouched
- [ ] 2.11 WHEN "Issue new link" is clicked THEN a confirmation is asked first; cancelling changes nothing
- [ ] 2.12 WHEN Save, autosave, Submit or an upload uses an expired or replaced token THEN nothing is stored and the expired page is shown
- [ ] 2.13 WHEN a link has expired THEN Screen B shows "Expired" with Copy disabled and Screen D says "Link expired — issue a new link"
- [ ] 2.14 WHEN a customer row is clicked THEN `/customers/<id>/package` (Screen D) opens; WHEN the id is unknown THEN the answer is 404
- [ ] 2.15 WHEN a customer's latest Package Overview file used an older schema version THEN its row in Screen B shows "Regenerate"
- [ ] 2.16 WHEN Generate JSON returns problems on Screen D THEN they are announced by one live region (no `role="alert"` nested in a `role="status"` region; unit test)
- [ ] 2.17 WHEN the link is issued or the customer unlocked THEN who and when are stored
- [ ] 2.18 WHEN the clipboard is refused THEN the link text is selected
- [ ] 2.19 WHEN the app is built THEN the README "Screens and routes" section lists `/customers` (B), `/customers/new` (C), `/customers/:customerId/package` (D) and `/intake/:token` (E), and a smoke test opens the list and reaches Screen D from a row (pr-9 nit 10 of IGN-8)

## 3. Verify
- [ ] 3.1 Automated review (PB - Review PR) against this spec
- [ ] 3.2 Human triage (gate 7) recorded in Linear 
