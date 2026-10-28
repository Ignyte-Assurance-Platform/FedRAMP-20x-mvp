## ADDED Requirements

### Requirement: Screen E tab 3 — document upload to the private bucket

The system SHALL behave as every scenario below states (brain work item [[wi-maaz20x-006-intake-documents]] at brain_commit af98c57; scope in proposal.md).

#### Scenario: the customer picks SOC 2 Type II
- **WHEN** the customer picks SOC 2 Type II
- **THEN** the list shows the SOC 2 items and the "Everyone" items, and the "Expected date of the next report" date field

#### Scenario: the customer picks FedRAMP Ready or GovRAMP
- **WHEN** the customer picks FedRAMP Ready or GovRAMP
- **THEN** the list shows Readiness Assessment Report and Security Assessment Plan plus the "Everyone" items

#### Scenario: the customer picks FedRAMP Rev 5 (authorized)
- **WHEN** the customer picks FedRAMP Rev 5 (authorized)
- **THEN** the list shows "Previous FedRAMP package and SAR" plus the "Everyone" items

#### Scenario: the period end date is more than 12 months ago
- **WHEN** the period end date is more than 12 months ago
- **THEN** a warning citing FRC-CLA-ASF is shown on the tab and on Screen D, and Save and Submit still work

#### Scenario: a 250 MB PDF is dropped
- **WHEN** a 250 MB PDF is dropped
- **THEN** it uploads straight to the bucket in a resumable session and appears in the list

#### Scenario: the connection drops halfway through an upload and comes back
- **WHEN** the connection drops halfway through an upload and comes back
- **THEN** the upload continues from where it stopped, not from the start

#### Scenario: an upload is started but never finished
- **WHEN** an upload is started but never finished
- **THEN** no row is written and nothing appears in either list

#### Scenario: a finished upload fails the type, size or signature check
- **WHEN** a finished upload fails the type, size or signature check
- **THEN** its object is deleted and no row is written

#### Scenario: a 251 MB file, a .zip or an .exe is dropped
- **WHEN** a 251 MB file, a .zip or an .exe is dropped
- **THEN** it is refused before upload with the matching message

#### Scenario: a PNG, SVG, VSDX, CSV, JSON or XML file is dropped
- **WHEN** a PNG, SVG, VSDX, CSV, JSON or XML file is dropped
- **THEN** it is accepted

#### Scenario: a file has no "What is this?", or a policy file has no version or last-updated date
- **WHEN** a file has no "What is this?", or a policy file has no version or last-updated date
- **THEN** Submit is blocked with the file named

#### Scenario: the customer renames a file
- **WHEN** the customer renames a file
- **THEN** only the display name changes and the download still returns the original object

#### Scenario: the customer replaces a file
- **WHEN** the customer replaces a file
- **THEN** they see only the new version and Ignyte sees "replaced on [date]" with both versions downloadable

#### Scenario: the customer has submitted
- **WHEN** the customer has submitted
- **THEN** tabs 1 and 2 are read-only, tab 3 still accepts uploads, renames and replacements, and the x is not shown

#### Scenario: a file is uploaded after Submit
- **WHEN** a file is uploaded after Submit
- **THEN** Screen D labels it "added after submission"

#### Scenario: Screen D opens
- **WHEN** Screen D opens
- **THEN** each listed item shows a check if a current file has that kind, and "missing" otherwise

#### Scenario: Ignyte removes a file
- **WHEN** Ignyte removes a file
- **THEN** it disappears from both sides and the object stays in the bucket
