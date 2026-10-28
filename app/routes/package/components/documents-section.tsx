import { Form } from "react-router";
import { Button } from "~/components/ui/button";
import { formatDate, formatDateTime } from "~/lib/dates";
import { formatBytes } from "~/lib/documents";

/**
 * Screen D, tab 3 (WI-006 §3): the certification with its dates and the 12-month warning, the
 * received/missing checklist of every item shown to this customer, and every current file with
 * its kind, policy fields, "added after submission" and its earlier versions ("replaced on"),
 * each downloadable. Remove is soft: the file disappears on both sides, the object stays.
 */

export interface DocumentsSectionData {
  certification: { label: string | null; periodEnd: string | null; nextReport: string | null; old: boolean; oldMessage: string };
  checklist: { kind: string; label: string; present: boolean }[];
  files: {
    id: string;
    displayName: string;
    originalFilename: string;
    size: number;
    kindLabel: string | null;
    kindNote: string | null;
    policyVersion: string | null;
    policyUpdatedOn: string | null;
    addedAfterSubmit: boolean;
    uploadedAt: Date | string;
    versions: { id: string; originalFilename: string; size: number; uploadedAt: Date | string; replacedOn: Date | string }[];
  }[];
}

/** A YYYY-MM-DD the customer typed, shown as that same day (noon UTC never crosses a day in ET). */
export const formatIsoDate = (iso: string) => formatDate(`${iso}T12:00:00Z`);

const linkClass = "inline-flex h-8 items-center rounded-md border bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent";

export function documentDownloadHref(customerId: string, documentId: string): string {
  return `/api/customers/${customerId}/documents/${documentId}/download`;
}

export function DocumentsSection({ customerId, data, busy }: { customerId: string; data: DocumentsSectionData; busy: boolean }) {
  const { certification, checklist, files } = data;
  return (
    <div className="grid gap-6">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[minmax(12rem,auto)_1fr]">
        <dt className="text-muted-foreground">Certification</dt>
        <dd>{certification.label ?? <span className="text-muted-foreground">not chosen yet</span>}</dd>
        <dt className="text-muted-foreground">Report period end or assessment date</dt>
        <dd>{certification.periodEnd ? formatIsoDate(certification.periodEnd) : <span className="text-muted-foreground">not given</span>}</dd>
        {certification.nextReport && (
          <>
            <dt className="text-muted-foreground">Expected date of the next report</dt>
            <dd>{formatIsoDate(certification.nextReport)}</dd>
          </>
        )}
      </dl>
      {certification.old && (
        <p role="status" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          {certification.oldMessage}
        </p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">Checklist</h3>
        <ul className="grid gap-1 text-sm" aria-label="Checklist">
          {checklist.map((item) => (
            <li key={item.kind} className="flex items-center gap-2">
              {item.present ? (
                <span className="text-green-700" aria-label="received">
                  ✓
                </span>
              ) : (
                <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">missing</span>
              )}
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Files</h3>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files yet.</p>
        ) : (
          <ul className="grid gap-3">
            {files.map((file) => (
              <li key={file.id} className="grid gap-2 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex-1 font-medium break-all">{file.displayName}</span>
                  {file.addedAfterSubmit && <span className="rounded bg-amber-500/15 px-1.5 text-xs">added after submission</span>}
                  <span className="text-muted-foreground">{formatBytes(file.size)}</span>
                  <a href={documentDownloadHref(customerId, file.id)} className={linkClass}>
                    Download
                  </a>
                  <Form
                    method="post"
                    onSubmit={(e) => {
                      if (!window.confirm(`Remove ${file.displayName}? It disappears for the customer too; the stored copy stays.`)) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="remove-document" />
                    <input type="hidden" name="documentId" value={file.id} />
                    <Button type="submit" variant="outline" size="sm" disabled={busy} aria-label={`Remove ${file.displayName}`}>
                      Remove
                    </Button>
                  </Form>
                </div>
                <p className="text-muted-foreground">
                  {file.kindLabel ?? "“What is this?” not answered"}
                  {file.kindNote ? ` · ${file.kindNote}` : ""}
                  {file.policyVersion ? ` · version ${file.policyVersion}` : ""}
                  {file.policyUpdatedOn ? ` · last updated ${formatIsoDate(file.policyUpdatedOn)}` : ""}
                  {file.displayName !== file.originalFilename ? ` · uploaded as ${file.originalFilename}` : ""} · {formatDateTime(file.uploadedAt)}
                </p>
                {file.versions.length > 0 && (
                  <ul className="grid gap-1 border-l-2 pl-3" aria-label={`Earlier versions of ${file.displayName}`}>
                    {file.versions.map((version) => (
                      <li key={version.id} className="flex flex-wrap items-center gap-3 text-muted-foreground">
                        <span className="flex-1 break-all">
                          {version.originalFilename} · replaced on {formatDate(version.replacedOn)}
                        </span>
                        <a href={documentDownloadHref(customerId, version.id)} className={linkClass}>
                          Download
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
