# Design — Screen E tab 3 — document upload to the private bucket

> Brain work item: [[wi-maaz20x-006-intake-documents]] · brain_commit a8e6ccc7d635c524a9aee82d5646f946cbaafa38 · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-006-intake-documents.md

## Behavior

- **Certification first.** The tab opens with "Which certification do you hold?" (single choice): SOC 2 Type II · FedRAMP Ready · FedRAMP Rev 5 (authorized) · GovRAMP. Next to it, "Report period end date or assessment completion date" (date). If the date is more than 12 months before today, a yellow warning reads "FedRAMP requires a certification from the past 12 months (FRC-CLA-ASF). You can continue; your consultant will follow up." It never blocks Save or Submit.
- **"Useful things to upload"** under the drop box, built from the certification:

| Shown to | Items |
|---|---|
| SOC 2 Type II | Complete SOC 2 Type II report · Bridge or gap letter (if applicable) · Audit engagement documentation (grey line: "An audit engagement letter, a certification from a successful audit, or a bridge letter if you are currently under audit") · Supplemental compliance evidence (if applicable) — plus the date field **"Expected date of the next report"** (a date, not a file) |
| FedRAMP Ready, GovRAMP | Readiness Assessment Report · Security Assessment Plan |
| FedRAMP Rev 5 (authorized) | Previous FedRAMP package and SAR |
| Everyone | Authorization boundary or architecture diagram · Security policies and procedures · Incident response plan and last test · Vulnerability scan summaries · Crypto modules with CMVP certificate numbers · Training materials or records · Change logs or monitoring evidence · Third-party and subprocessor list |

  Before a certification is chosen, only the "Everyone" items are shown. The third-party list is also asked as data on tab 1 ([[wi-maaz20x-004-intake-company-service]]), which fills the Package Overview; the document is the formal version.
- **Upload.** The customer drags files onto the dashed box or clicks it to choose. Each file goes straight to the bucket in a resumable upload session the app opens for it (size and type fixed when the session opens); a dropped connection resumes where it stopped. A refused file shows why before uploading: wrong type ("This file type is not accepted. Accepted: PDF, Word, Excel, PNG, JPG, SVG, Visio, CSV, JSON, XML"), zip ("Please upload the files inside the zip one by one"), or size ("Files can be up to 250 MB each"). A large package can be sent as several files.
- **File list.** Each file shows its display name, size, a **"What is this?"** dropdown (the items currently listed, plus "Other" with a short note of up to 200 characters), and actions **Rename**, **Replace** and **x** (remove). For "Security policies and procedures", two more fields appear next to the file: "Version" (short text) and "Last updated" (date).
- **Rename** changes only the name shown in the list, at any time; the stored file is untouched.
- **Replace** uploads a new version at any time, before or after Submit. The previous version is kept: the customer sees only the current one; Ignyte sees "replaced on [date]" with the earlier versions downloadable.
- **Remove (x)** is available to the customer until Submit. After Submit the x is gone for the customer; Ignyte can still remove a file on Screen D.
- **After "Submit to Ignyte"** tabs 1 and 2 are locked (wi-004) but tab 3 stays open: the customer can add, rename and replace files, and change the certification, its date and the expected date of the next report. Files added after Submit are labelled **"added after submission"** on Screen D. A change to any of the three certification answers while the customer is Submitted is labelled **"changed after submission on [date]"** next to the certification on Screen D (the date of the latest such change); the earlier values are not kept. Saving the same values again is not a change. The label stays after an unlock and a new Submit, like the file label.
- **Screen D (customer page)** shows the certification, its date (with the same 12-month warning) and, for SOC 2, the expected date of the next report, with the "changed after submission on [date]" label when it applies; then the checklist of every item shown to that customer with a check when at least one file has that "What is this?" value and **"missing"** otherwise; then the file list with kind, version and date for policies, "added after submission" and "replaced on" labels, Download and Remove.
- Files are only stored: nothing reads or analyses them and no AI is used. They are kept with no retention period; nothing is deleted automatically.

## Data and fields

Tab 3 answers in `intake_answers` (JSON column, same pattern as tabs 1 and 2):

```json
{
  "certification": { "type": "soc2_type2 | fedramp_ready | fedramp_rev5 | govramp | null", "period_end_date": "YYYY-MM-DD | null", "next_report_expected": "YYYY-MM-DD | null", "changed_after_submit_at": "ISO timestamp | null" }
}
```

`changed_after_submit_at` is set by the server, never by the browser: on a save while the customer is Submitted, when `type`, `period_end_date` or `next_report_expected` differs from the stored value, it becomes the time of that save; otherwise it keeps its stored value.

`documents` table per [[maaz20x-contract-document-storage]] §3, plus:

| Column | Type | Notes |
|---|---|---|
| `display_name` | text | Defaults to the original file name; Rename changes it |
| `kind` | text | Item key from the form definition (`soc2_report`, `bridge_letter`, `engagement_docs`, `supplemental_evidence`, `rar`, `sap`, `rev5_package_sar`, `boundary_diagram`, `policies`, `ir_plan_test`, `vuln_scans`, `crypto_cmvp`, `training`, `change_logs`, `third_parties`, `other`) |
| `kind_note` | text | Required when `kind = other`, ≤ 200 chars |
| `policy_version`, `policy_updated_on` | text, date | Only for `kind = policies` |
| `added_after_submit` | boolean | True when uploaded while the customer is Submitted |
| `replaces_document_id` | uuid null | Points to the previous version; the previous row gets `superseded_at` |
| `removed_at`, `removed_by` | timestamp, text | Soft removal; the object stays in the bucket (no retention period, Max 2026-10-20) |
| `md5`, `crc32c` | text | Checksums Cloud Storage computed for the object, recorded when the upload finishes; `sha256` stays null until the document pipeline (post-MVP) fills it |

A row is written only when an upload finishes and passes the checks in §5; an upload that is started but never finished leaves no row.

The item list per certification, its labels and grey lines live in a form definition file, not in code: `form-definitions/documents.v1.json` in FedRAMP-20x-mvp, next to tab 1's `company.v1.json`. It does not wait for the general form engine of [[wi-maaz20x-011-form-engine]], which can later read the same file (engineer review, 2026-10-27).

## Validation

- Accepted types (extension and content type, checked in the browser and in the signed-URL policy): PDF (`pdf`), Word (`doc`, `docx`), Excel (`xls`, `xlsx`), PNG (`png`), JPG (`jpg`, `jpeg`), SVG (`svg`), Visio (`vsd`, `vsdx`), CSV (`csv`), JSON (`json`), XML (`xml`). Zip (`zip`) always refused with its own message.
- Size ≤ 250 MB per file (browser and signed-URL policy).
- Submit is blocked while any current file has no "What is this?", a file of kind "Other" has no note, or a policy file lacks its version or last-updated date. Nothing else on this tab blocks Submit (an empty tab is allowed).
- The 12-month warning compares `period_end_date` with today; it never blocks.

## Permissions

Customer (link holder): upload, set kind, rename, replace and change the certification answers before and after Submit; remove only before Submit. Ignyte users on Screen D: read, download every version, remove any file. The customer never sees earlier versions or removed files.

## Flows

```mermaid
sequenceDiagram
  participant C as Customer
  participant A as App
  participant B as Bucket (private)
  participant DB as Postgres
  C->>A: choose certification + date (Save)
  A->>DB: upsert intake_answers tab 3 (changed_after_submit_at if Submitted and a value changed)
  C->>A: request upload (name, type, size)
  A->>A: check type, zip, size
  A->>B: open resumable session (size, type fixed)
  A-->>C: document id + session URL
  C->>B: upload bytes in parts (resumes on drop)
  C->>A: upload done (document id), kind, policy fields
  A->>B: check object: exists, size, type, signature
  alt checks pass
    A->>DB: insert documents row (md5, crc32c); added_after_submit if Submitted
  else checks fail
    A->>B: delete object (no row)
  end
  C->>A: Replace file X
  A->>DB: new row replaces_document_id = X; X.superseded_at = now
```

## Integrations

Storage decisions (engineer review, Jesús, 2026-10-27; recorded in [[maaz20x-contract-document-storage]] §2 and §3):

1. **Resumable, opened by the server.** The app opens a Cloud Storage resumable session with the object path, content type and exact size (`X-Upload-Content-Length`) and the browser's origin, and returns the session URL; the browser uploads in parts and resumes after a drop. Cloud Storage refuses a final size that differs. The logo keeps its single signed PUT (≤ 2 MB). The local store emulates the session (`Content-Range` parts) so the flow runs without the cloud.
2. **Checksums from Cloud Storage, not SHA-256.** Cloud Storage computes MD5 and CRC32C, never SHA-256. On finish the app records those two from the object's metadata; `sha256` stays null until the document pipeline (post-MVP, with deduplication) reads the files. The finish request does not read 250 MB.
3. **Row on finish only, no "pending" row.** Same pattern as the logo: start reserves a document id and its object path, finish checks the object and only then inserts the row. Abandoned uploads leave an object without a row, never a row without an object.
4. **Removal is soft; only refused uploads are hard-deleted.** The customer's x (before Submit) and Ignyte's remove set `removed_at`; the object stays (Max, 2026-10-20). A finished upload that fails the checks in §5 is deleted from the bucket and never gets a row. Cleaning objects abandoned without a row is post-MVP.


- [[integration-maaz20x-to-google-cloud-storage-documents]] — upload rules updated in [[maaz20x-contract-document-storage]] §2 (types, 250 MB, versions, no deletion).

## Non-functional requirements

Resumable uploads opened by the server; the finish request never reads the file's bytes beyond the signature check; objects never public (the documents bucket has Public Access Prevention enforced; the only public object is the company logo of [[wi-maaz20x-004-intake-company-service]], kept in a separate logos bucket, [[maaz20x-contract-document-storage]]; clarified for Christina's comment on brief 04, 2026-10-22, and for the bucket split, 2026-10-26); no retention period or automatic deletion until Ignyte defines one; item lists and labels are data (form definition), so the next review round changes a file, not code.
