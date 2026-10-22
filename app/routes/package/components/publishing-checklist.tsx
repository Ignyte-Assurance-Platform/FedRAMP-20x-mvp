/**
 * What the consultant hands the customer with a passing file (WI-007 F-e), in the order of
 * the playbook's step S3-03 items 11–14: the three FRC-CSO-JSN points, CDS-CSO-PUB's logo
 * rule, and a last check with FedRAMP's own validator. Shown only next to a valid file.
 */
export const PUBLISHING_CHECKLIST: readonly string[] = [
  "Other websites can read the file: CORS allows web applications on other domains to load it.",
  "The file is served with Content-Type: application/json.",
  "The file is served with X-Content-Type-Options: nosniff.",
  "The logo link opens directly as an image in a browser: no download, sign-in or processing.",
  "Final test: load the file's public web address in FedRAMP's JSON Schema Validator and check that it passes.",
];

export function PublishingChecklist() {
  return (
    <section aria-labelledby="publishing-checklist-title" className="rounded-md border p-4">
      <h3 id="publishing-checklist-title" className="text-sm font-semibold">
        Publishing checklist
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">Give this to the customer with the file.</p>
      <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm">
        {PUBLISHING_CHECKLIST.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </section>
  );
}
