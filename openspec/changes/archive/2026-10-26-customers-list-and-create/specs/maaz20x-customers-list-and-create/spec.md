## ADDED Requirements

### Requirement: Screens B and C — customers list and create customer with intake link

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-003-customers-list-and-create]] at brain_commit a739b08; scope in proposal.md).

#### Scenario: a customer is saved
- **WHEN** a customer is saved
- **THEN** an intake link with a 32-character random token is generated and shown, and the database holds only its hash and its encrypted form

#### Scenario: the list loads
- **WHEN** the list loads
- **THEN** every customer shows its status and a working Copy link

#### Scenario: a required field is empty
- **WHEN** a required field is empty
- **THEN** Save is blocked and the field is marked

#### Scenario: the customer first saves the intake
- **WHEN** the customer first saves the intake
- **THEN** the status in Screen B changes to In progress

#### Scenario: the customer submits
- **WHEN** the customer submits
- **THEN** the status changes to Submitted and the link is read-only

#### Scenario: Unlock is clicked on a Submitted customer
- **WHEN** Unlock is clicked on a Submitted customer
- **THEN** status returns to In progress and the link is editable again

#### Scenario: two customers are created
- **WHEN** two customers are created
- **THEN** their tokens differ and both match `^[A-Za-z0-9_-]{32}$`; the generator uses the crypto RNG (unit test)

#### Scenario: a link is opened 30 days or more after it was issued
- **WHEN** a link is opened 30 days or more after it was issued
- **THEN** the form is not shown and the page says "This link has expired. Ask your Ignyte consultant for a new one."

#### Scenario: "Issue new link" is clicked on Screen D
- **WHEN** "Issue new link" is clicked on Screen D
- **THEN** a new token is generated, the old link stops working at once, and the new link is shown with Copy

#### Scenario: a link is re-issued
- **WHEN** a link is re-issued
- **THEN** saved answers, documents, status and lock are untouched

#### Scenario: "Issue new link" is clicked
- **WHEN** "Issue new link" is clicked
- **THEN** a confirmation is asked first; cancelling changes nothing

#### Scenario: Save, autosave, Submit or an upload uses an expired or replaced token
- **WHEN** Save, autosave, Submit or an upload uses an expired or replaced token
- **THEN** nothing is stored and the expired page is shown

#### Scenario: a link has expired
- **WHEN** a link has expired
- **THEN** Screen B shows "Expired" with Copy disabled and Screen D says "Link expired — issue a new link"

#### Scenario: a customer row is clicked
- **WHEN** a customer row is clicked
- **THEN** `/customers/<id>/package` (Screen D) opens; WHEN the id is unknown THEN the answer is 404

#### Scenario: a customer's latest Package Overview file used an older schema version
- **WHEN** a customer's latest Package Overview file used an older schema version
- **THEN** its row in Screen B shows "Regenerate"

#### Scenario: Generate JSON returns problems on Screen D
- **WHEN** Generate JSON returns problems on Screen D
- **THEN** they are announced by one live region (no `role="alert"` nested in a `role="status"` region; unit test)

#### Scenario: the link is issued or the customer unlocked
- **WHEN** the link is issued or the customer unlocked
- **THEN** who and when are stored

#### Scenario: the clipboard is refused
- **WHEN** the clipboard is refused
- **THEN** the link text is selected

#### Scenario: the app is built
- **WHEN** the app is built
- **THEN** the README "Screens and routes" section lists `/customers` (B), `/customers/new` (C), `/customers/:customerId/package` (D) and `/intake/:token` (E), and a smoke test opens the list and reaches Screen D from a row (pr-9 nit 10 of IGN-8)
