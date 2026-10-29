import { Form } from "react-router";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { formatDateTime } from "~/lib/dates";

/**
 * Screen D, tab 2 (WI-005 §3): the customer's KSI answers read-only, block by block, with the
 * follow-ups (Needs help and Not answered, computed live) at the top. Statements come from the
 * rules version the customer answered under, with a note when that is not the current one. On
 * KSI-SVC-SIN, Ignyte's "CMVP validated?" control and the log-context note (intake 17); the
 * customer never sees them.
 */

export interface KsisSectionData {
  rulesVersion: string;
  rulesNote: string | null;
  counts: string;
  followUps: { key: string; title: string; statusLabel: string }[];
  blocks: {
    key: string;
    title: string;
    statement?: string;
    statusLabel: string;
    questions: { id: string; text: string; answer: string; recommended: boolean }[];
    howOften?: string;
    needHelp: boolean;
  }[];
  review: { cmvpValidated: boolean | null; cmvpNote: string | null; logContextNote: string | null; updatedAt: Date | string | null };
  savedAt: Date | string | null;
}

export const CMVP_BLOCK = "KSI-SVC-SIN";
export const KSI_REVIEW_NOTE_MAX = 2000;

const textareaClass = "min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs";
const empty = <span className="text-muted-foreground">No answer</span>;

function ReviewForm({ review, busy, message, error }: { review: KsisSectionData["review"]; busy: boolean; message?: string; error?: string }) {
  const cmvp = review.cmvpValidated === null ? "" : review.cmvpValidated ? "yes" : "no";
  return (
    <Form method="post" className="grid gap-3 rounded-md border border-dashed p-3" aria-label="Ignyte only">
      <input type="hidden" name="intent" value="ksi-review" />
      <p className="text-xs font-medium uppercase text-muted-foreground">Ignyte only · never shown to the customer</p>
      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="cmvp-validated">CMVP validated?</Label>
        <select id="cmvp-validated" name="cmvpValidated" defaultValue={cmvp} className="h-9 rounded-md border bg-background px-2 text-sm shadow-xs">
          <option value="">Not checked</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cmvp-note">CMVP note</Label>
        <textarea id="cmvp-note" name="cmvpNote" defaultValue={review.cmvpNote ?? ""} maxLength={KSI_REVIEW_NOTE_MAX} className={textareaClass} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="log-context-note">Log retention and review (optional context)</Label>
        <textarea id="log-context-note" name="logContextNote" defaultValue={review.logContextNote ?? ""} maxLength={KSI_REVIEW_NOTE_MAX} className={textareaClass} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={busy}>
          Save
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : message ? (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : review.updatedAt ? (
          <p className="text-sm text-muted-foreground">Last saved {formatDateTime(review.updatedAt)}</p>
        ) : null}
      </div>
    </Form>
  );
}

export function KsisSection({ data, busy, message, error }: { data: KsisSectionData; busy: boolean; message?: string; error?: string }) {
  return (
    <div className="grid gap-6">
      <p className="text-sm font-medium">{data.counts}</p>
      {data.rulesNote && (
        <p role="status" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          {data.rulesNote}
        </p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">Follow-ups</h3>
        {data.followUps.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="grid gap-1 text-sm" aria-label="Follow-ups">
            {data.followUps.map((f) => (
              <li key={f.key}>
                <a href={`#ksi-d-${f.key}`} className="underline">
                  {f.title}
                </a>
                {` · ${f.statusLabel}`}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4">
        {data.blocks.map((block) => (
          <section key={block.key} id={`ksi-d-${block.key}`} className="grid gap-3 rounded-md border p-3 text-sm" aria-label={block.title}>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="flex-1 font-semibold">{block.title}</h3>
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">{block.statusLabel}</span>
            </div>
            {block.statement && (
              <div>
                <blockquote className="border-l-2 pl-3">{block.statement}</blockquote>
                <p className="mt-1 pl-3 text-xs text-muted-foreground">{`FedRAMP rules ${data.rulesVersion}`}</p>
              </div>
            )}
            <dl className="grid gap-2">
              {block.questions.map((q) => (
                <div key={q.id}>
                  <dt className="text-muted-foreground">
                    {q.text}
                    {q.recommended && <span className="ml-2 rounded bg-muted px-1.5 text-xs">Recommended</span>}
                  </dt>
                  <dd className="whitespace-pre-wrap">{q.answer.trim() ? q.answer : empty}</dd>
                </div>
              ))}
              {block.howOften !== undefined && (
                <div>
                  <dt className="text-muted-foreground">How often?</dt>
                  <dd>{block.howOften.trim() ? block.howOften : empty}</dd>
                </div>
              )}
            </dl>
            {block.needHelp && <p className="font-medium">The customer asked for help with this one.</p>}
            {block.key === CMVP_BLOCK && <ReviewForm review={data.review} busy={busy} message={message} error={error} />}
          </section>
        ))}
      </div>
    </div>
  );
}
