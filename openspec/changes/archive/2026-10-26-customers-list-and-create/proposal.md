# Screens B and C — customers list and create customer with intake link

> Brain work item: [[wi-maaz20x-003-customers-list-and-create]] · brain_commit a739b08ecff5ee0a226492e0951aa702516032dd · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-003-customers-list-and-create.md
> Compiled by PB - Spec Compile. Do NOT edit intent here; intent changes go back to the brain (Escalation Rule).

## Why

- [[maaz20x-mvp-plan-v3-1]] §2.3–2.7: table (name, service, status Not started / In progress / Submitted, link, created), Create customer, Copy link; fields company, service name, service description (boundary), primary contact name, email; 32-char random token.
- [[maaz20x-consultant-playbook-prototype]] §2: today one Sheet per client; the customer record replaces the Start Here cells.
- **Christina's comments on Max's copy 03, 2026-10-22** (3 comments, no decision box; SME input, not a signature): points 1–5, 7 and 8 Keep; point 6 Change: "A link that never expires, giving access to a customer's security answers, is too weak to rely on. Use Tanner's sign-in or add link expiry."; question 3: leave search out until there are more customers. Applied below: the link expires and can be re-issued (Jesús, 2026-10-23); Tanner's sign-in is not taken for the MVP.
- [[maaz20x-chat-2026-10-22-christina-app-changes]] row 5 / B7: the consultant names the customer before the link exists (required fields on Screen C) and an expired or replaced link shows a clear "ask for a new link" page (E4; the page itself is [[wi-maaz20x-004-intake-company-service]]'s).
- [[wi-maaz20x-007-package-overview-json]] (frozen at 7b3564b): Screen D is built at `/customers/:customerId/package`; its "Regenerate" flag shows in the customers list "when wi-003 ships"; IGN-8 triage left two items here: one live region on Screen D (pr-9 nit 8) and the README route (pr-9 nit 10).
- Code on `main` (FedRAMP-20x-mvp): `customers` already exists (`id, name, created_by, created_at, updated_at` plus wi-007's assessor and advisor columns).

## What changes

List, create, copy link, issue a new link, unlock after submit (§2.17), and the "Intake link" section on Screen D. Out: edit or delete a customer; search (Christina, question 3: not until there are more customers); sending the link by email (the consultant copies it); the expired-link page and intake-side checks of the token ([[wi-maaz20x-004-intake-company-service]]).

## Out of scope

See "Scope" in the brain spec; anything not listed there is out.
