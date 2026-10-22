/**
 * What the consultant hands the customer with a passing file, in FedRAMP's words
 * (FRC-CSO-JSN, WI-007 F-e). Shown only next to a valid file.
 */
export const PUBLISHING_CHECKLIST: readonly string[] = [
  "The file is at a public web address.",
  "It is served with Content-Type: application/json.",
  "It is served with X-Content-Type-Options: nosniff.",
  "Other websites can read it (CORS allows other origins).",
  "The logo link opens as an image in a browser.",
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
