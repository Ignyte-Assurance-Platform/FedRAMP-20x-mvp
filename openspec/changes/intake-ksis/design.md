# Design — Screen E tab 2 — KSI questions (7 Class A KSIs) with "need help" skip

> Brain work item: [[wi-maaz20x-005-intake-ksis]] · brain_commit 50fdb15cd9b3c71e2a85818932a3e17d50e3bf16 · ignyte-project-brain/projects/maaz20x/work-items/wi-maaz20x-005-intake-ksis.md

## Behavior

- Tab 2 shows seven collapsible blocks in playbook order. Header of each block: KSI code (for example `KSI-CED-RAT`), KSI name in bold, status label on the right (Christina, 2026-10-22, [[maaz20x-chat-2026-10-21-christina-questions]]): **Answered** (every question in the block has an answer, including "How often?" where it is required), **Partly answered** (some questions filled, not all), **Needs help** (the checkbox is ticked; it outranks Answered, because the help request is what the consultant must act on), or **Not answered** (nothing filled in and help not ticked). A block with only "Needs help" ticked and nothing typed is not answered. An answer counts when it has text after trimming spaces (it is stored as typed). For KSI-CED-RAT, KSI-CNA-RNT and KSI-INR-RIR, where the question itself asks how often, "answered" means the question has text; the app does not try to detect a frequency in it. An optional "How often?" line never counts: a block with only that line filled is **Not answered**. These rules live in one function shared by tab 2 and Screen D (E5).
- The tab shows two separate counts over the seven KSI blocks, for example "5/7 answered, 1 needs help". A block can count in both: a block with every answer filled and help ticked shows **Needs help** and still counts as answered. The Vulnerability detection block is not part of the counts. This is a design choice; FedRAMP does not say how a form counts answers.
- Inside each block, in this order: (1) FedRAMP's KSI statement, verbatim from the vendored consolidated rules (E1), with the version read from that file shown under it ("FedRAMP rules <version>", today 2026.10.13.01). The statement is shown exactly as FedRAMP wrote it, including its wording slips (KSI-IAM-APM ends "…phishing-resistant MFA is used"); it is never corrected; an optional one-line plain-language gloss may follow but never replaces the statement; (2) the question(s) below, each with its own answer box; (3) the block's short grey "why we ask" line (below); (4) a "How often?" short-text line where marked, with the grey line "FedRAMP expects ongoing activities to run on a known, documented cycle."; (5) the checkbox "I don't know, I need help from Ignyte with this one".
- Questions per KSI (wording from Christina's 2026-10-19 review, merged on 2026-10-22). All go to the customer. One question per block, except KSI-IAM-APM: 22, 15 and 20 are her rewordings and replace the original question (the "(added)" rows of review copy 05 came from a misreading of her comments); 14b is a genuine addition; 21 and 23 are single reworded questions. "How often?" is required only where the KSI statement says "persistently reviewed" (KSI-CED-RAT, KSI-CNA-RNT, KSI-INR-RIR), and there the question itself asks it; the separate "How often?" line on the other blocks is optional and does not affect the status. The separate line belongs to the block, not to a question: KSI-IAM-APM has two questions and one "How often?" line. The rule is kept in the form definition (E2); the table below only shows it.

| KSI | Intake # | Question shown to the customer | Separate "How often?" line |
|---|---|---|---|
| KSI-CED-RAT Reviewing All Training | 22 | How do you check that security training works for all staff, high-risk roles, engineering staff, and incident response or recovery staff, and how often? | no (the question asks it; required) |
| KSI-CMT-LMC Logging Changes | 21 | How are production changes logged, who monitors those logs, and how often? | no |
| KSI-CNA-RNT Restricting Network Traffic | 23 | How do you restrict inbound and outbound traffic, and how often do you review those rules? For example, firewalls, security groups, private subnets, allow-lists. | no (the question asks it; required) |
| KSI-IAM-AAM Automating Account Management | 15 | Which parts of creating, changing and removing accounts, roles and groups are automated, and which are still manual? | **yes**, optional |
| KSI-IAM-APM Adopting Passwordless Methods | 14 | How do administrators and users sign in? Is MFA phishing-resistant (for example FIDO2 keys, passkeys, PIV)? | **yes**, optional |
| KSI-IAM-APM | 14b (new) | Where are passwords still used, and why? | — |
| KSI-INR-RIR Reviewing Incident Response Procedures | 20 | How do you review whether your incident response procedures work, how often, and what changed after the last review? | no (the question asks it; required) |
| KSI-SVC-SIN Securing Information | 16 | How is information protected from unwanted access or modification, at rest and in transit, and which crypto modules are used? | **yes**, optional |

- Intake 24 ("documented recovery procedures and tests") is **not shown**; it is covered by 20.
- **"Why we ask" line per block**, shown to the customer, Christina's customer-facing lines (2026-10-22, [[maaz20x-chat-2026-10-21-christina-questions]] §2, verbatim; same text as the "Why we ask (client)" column of [[maaz20x-intake-questionnaire]] §2). KSI-CED-RAT: "FedRAMP asks whether your training actually works, not just whether people took it, for all staff, high-risk roles, engineers, and incident response or recovery staff." · KSI-CMT-LMC: "FedRAMP asks that changes to your service are both logged and monitored, including changes made outside your normal deployment process." · KSI-CNA-RNT: "FedRAMP asks that you limit both incoming and outgoing traffic, and keep checking those limits over time." · KSI-IAM-AAM: "FedRAMP asks that accounts, roles and groups, and what they can access, are managed through automation rather than by hand." · KSI-IAM-APM: "FedRAMP expects passwordless sign-in where it's feasible; where passwords remain, it expects strong passwords with phishing-resistant MFA, so we need to know where they are." · KSI-INR-RIR: "FedRAMP asks that you keep checking whether your incident response procedures actually work, not only that a plan exists." · KSI-SVC-SIN: "FedRAMP asks that information is protected from unwanted access or changes. Your consultant checks the encryption modules you list." · Vulnerability detection, question 18: "FedRAMP requires you to keep finding vulnerabilities, using methods that fit your service, such as scanning, testing, threat intelligence and disclosure reports."; question 19: "This helps us plan how quickly findings get fixed. FedRAMP recommends fix timeframes at Class A but doesn't require them." The Playbook's internal "Why we ask" lines are never shown to the customer ("Do not share the playbook text with the client").
- The 2026-10-22 Intake tab merges 14 and 14b into one question; that is the consultant-side tool's wording. The customer form keeps them as two questions with their own answer boxes.
- **Vulnerability detection block**, below the seven KSI blocks, same visual pattern (collapsible, status label, "need help" checkbox), header "Vulnerability detection" with the grey line "Not one of the seven Class A KSIs. FedRAMP requires vulnerability detection at Class A; fixing timeframes are recommended, not required." (Christina, 2026-10-22: intake 18 is VDR-CSO-DET, MUST, on the Class A required list FRC-CLA-MFR; intake 19 is VDR-TFR-PVR and VER-TFR-EVU, on the Class A recommended list FRC-CLA-RFR, SHOULD). Two questions: intake 18, reworded "How do you find vulnerabilities, using which methods, and how often?"; intake 19, reworded "How are findings fixed, and within what timeframes?" labelled **Recommended** (Christina, 2026-10-22, review copy 05 comment on question 19: "Keep it in the vulnerability block, labeled recommended"). The block's status label ignores the recommended question 19: question 18 answered is **Answered**; only question 19 filled is **Not answered**.
- Intake 17 (where logs go, who reviews them) is not in the customer form. It appears on Screen D as an optional consultant note field "Log retention and review (optional context)" so the playbook item is not lost.
- "Need help" ticked: the answer boxes of that block stay editable but are not needed; the block shows **Needs help** and is listed as a consultant follow-up on Screen D. Blocks left empty (**Not answered**) are also follow-ups; a **Partly answered** block is not a follow-up and shows its label in place. Follow-ups are computed live from the saved answers, not frozen at Submit, because Ignyte can unlock and the customer can change them.
- Save stores every answer, "How often?" value and flag per KSI/question, with `rules_version` (E3). Submit does not require anything on this tab (tab 1 rules apply to Submit), but it first saves pending tab 2 changes (E3b). After Submit the whole tab is read-only, the "need help" checkbox included, until Ignyte unlocks (E4).
- Screen D (customer page) shows the tab read-only, block by block, with follow-ups grouped at the top. The statements are rendered from the vendored folder of the saved `rules_version`; when it differs from the version vendored now, Screen D adds the note "Answered under FedRAMP rules <saved>; current rules <current>." On KSI-SVC-SIN it adds a consultant-only control **"CMVP validated?"** (Not checked / Yes / No, plus a note) next to the customer's answer; this is the consultant's lookup of the named modules, never shown to the customer.
- The answers are only stored in this version. The next version turns them into a result file that validates against FedRAMP's Security Decision Record JSON schema; the storage shape below is chosen so one record per KSI code maps onto it.

## Data and fields

`intake_answers` tab 2, JSON column:

```json
{
  "rules_version": "2026.10.13.01",
  "ksi": {
    "KSI-CED-RAT": { "questions": { "22": "" }, "how_often": null, "need_help": false },
    "KSI-CMT-LMC": { "questions": { "21": "" }, "how_often": null, "need_help": false },
    "KSI-CNA-RNT": { "questions": { "23": "" }, "how_often": null, "need_help": false },
    "KSI-IAM-AAM": { "questions": { "15": "" }, "how_often": "", "need_help": false },
    "KSI-IAM-APM": { "questions": { "14": "", "14b": "" }, "how_often": "", "need_help": false },
    "KSI-INR-RIR": { "questions": { "20": "" }, "how_often": null, "need_help": false },
    "KSI-SVC-SIN": { "questions": { "16": "" }, "how_often": "", "need_help": false }
  },
  "readiness": {
    "vulnerability_detection": { "questions": { "18": "", "19": "" }, "need_help": false }
  }
}
```

- Question ids are the intake numbers; the `b` suffix marks the one added question (14b). The question text, "why we ask" line, order and the "How often?" rule live in `form-definitions/ksis.v1.json` (E2), not in code. Stored `how_often` is a string where the block has the optional line and `null` where it has none; the rule itself is only in the form definition. The server refuses keys that are not in the form definition (E3).
- KSI statements are not stored with the answers; they are rendered from the vendored rules folder for `rules_version`. `rules_version` is the vendored version in force at the last save, stamped by the server. When a newer version is vendored, the customer form shows the new statements and the stamp moves on the next save; until then Screen D renders the saved version and shows the note in §3.
- Consultant-side columns on `customers` (Screen D only, E6): `cmvp_validated` (boolean, null = not checked; KSI-SVC-SIN), `cmvp_note` (text, up to 2,000), `log_context_note` (text, up to 2,000; intake 17), `ksi_review_updated_at`, `ksi_review_updated_by`. Add-only migration. They never appear in the customer's intake data, and the customer's intake action refuses them.

## Validation

No required fields on this tab; Submit is allowed with empty blocks and with "need help" ticked (both become consultant follow-ups). Free text up to 10,000 characters per answer; "How often?" up to 200; checked in the browser and on the server. Status labels and the two counts come from one shared function over the stored values (E5, rules in §3), in the browser for tab 2 and on the server for Screen D.

## Permissions

Same as tab 1 for the customer: writable until Submit, read-only after it until Ignyte unlocks (E4). The CMVP control and the log-context note are writable by Ignyte users on Screen D only and are never rendered on the customer form.

## Flows

Same as tab 1 (open link → load draft → render from form definition + vendored rules → Save upserts the `ksis` section with the version check and stamps `rules_version` → Submit saves pending tab 2 changes, then locks). Screen D additionally writes the consultant columns on `customers`.

## Integrations

None at runtime: the rules are a vendored file read at start-up, never fetched (E1). No dependency on [[wi-maaz20x-012-fedramp-rules-sync]] for delivery; wi-012 later builds its check and updates page on the file, manifest and loader this item adds.

## Non-functional requirements

Plain textarea for every answer, no rich-text editor (E7; replaces plan §3.5's "Lexical if it fits"). Question wording and the "How often?" rule are data (form definition), so the next review round changes a file, not code. The mockup is not a source: where it differs from this spec (question 22, action C1 in [[maaz20x-chat-2026-10-21-christina-questions]]), this spec wins.
