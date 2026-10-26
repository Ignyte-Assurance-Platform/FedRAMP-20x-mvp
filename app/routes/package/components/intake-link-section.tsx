import { Form } from "react-router";
import { CopyLink } from "~/components/copy-link";
import { Button } from "~/components/ui/button";
import { formatDateTime } from "~/lib/dates";

export const ISSUE_LINK_CONFIRM = "The current link will stop working at once. Issue a new link?";

export interface IntakeLinkSectionProps {
  status: "not_started" | "in_progress" | "submitted";
  statusLabel: string;
  url: string | null;
  expired: boolean;
  expiresAt: Date | string | null;
  busy: boolean;
}

/**
 * "Intake link" on Screen D (WI-003): status, the link or "Expired", its expiry, Copy,
 * Issue new link (asks first; cancelling changes nothing) and Unlock when Submitted.
 */
export function IntakeLinkSection({ status, statusLabel, url, expired, expiresAt, busy }: IntakeLinkSectionProps) {
  return (
    <div className="grid gap-3 text-sm">
      <p>
        Status: <span className="font-medium">{statusLabel}</span>
        {status === "submitted" && <span className="text-muted-foreground"> · the customer's form is read-only</span>}
      </p>
      <CopyLink url={url} />
      <p className="text-muted-foreground">
        {expired ? (
          <span className="font-medium text-destructive">Link expired — issue a new link</span>
        ) : expiresAt ? (
          `Expires ${formatDateTime(expiresAt)}`
        ) : null}
      </p>
      <div className="flex flex-wrap gap-3">
        <Form
          method="post"
          onSubmit={(event) => {
            if (!window.confirm(ISSUE_LINK_CONFIRM)) event.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="issue-link" />
          <Button type="submit" variant="outline" disabled={busy}>
            Issue new link
          </Button>
        </Form>
        {status === "submitted" && (
          <Form method="post">
            <input type="hidden" name="intent" value="unlock" />
            <Button type="submit" variant="outline" disabled={busy}>
              Unlock
            </Button>
          </Form>
        )}
      </div>
    </div>
  );
}
