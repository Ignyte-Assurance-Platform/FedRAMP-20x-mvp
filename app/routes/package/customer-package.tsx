import { data, Form, useNavigation, useSubmit } from "react-router";
import * as v from "valibot";
import { MissingAcronymError } from "~server/fedramp";
import {
  CustomerError,
  generatePackageOverviewForCustomer,
  getDocumentsScreen,
  getKsisScreen,
  IntakeDocumentError,
  getIntakeLinkSection,
  issueNewIntakeLink,
  getPackageOverviewScreen,
  PackageOverviewError,
  removeDocumentByStaff,
  requireStaffUser,
  saveKsiReview,
  savePackageOverviewInputs,
  setAssessorConfirmed,
  unlockIntake,
} from "~server/services";
import { AppShell } from "~/components/layout/app-shell";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { formatDateTime } from "~/lib/dates";
import { PRODUCT_NAME } from "~/lib/product";
import { AnswersReadOnly, LOGO_PATH } from "./components/answers-read-only";
import { DocumentsSection } from "./components/documents-section";
import { IntakeLinkSection } from "./components/intake-link-section";
import { KsisSection } from "./components/ksis-section";
import { ProblemList } from "./components/problem-list";
import { PublishingChecklist } from "./components/publishing-checklist";
import type { Route } from "./+types/customer-package";

/**
 * Screen D (WI-007): the customer's tab 1 answers read-only, the Ignyte-only boxes,
 * Generate JSON with its result, the latest file with its versions and the download.
 * WI-003 adds the "Intake link" section (Copy, Issue new link, Unlock) above them; WI-006 adds
 * tab 3: the certification, the received/missing checklist and the files, with Download and Remove;
 * WI-005 adds tab 2 read-only with its follow-ups and Ignyte's CMVP and log-context fields.
 * Staff only; customer link tokens are refused (requireStaffUser).
 */

const CustomerId = v.pipe(v.string(), v.uuid());

const ActionInput = v.variant("intent", [
  v.object({
    intent: v.literal("save-inputs"),
    assessorName: v.optional(v.string(), ""),
    assessorId: v.optional(v.string(), ""),
    advisorName: v.optional(v.string(), ""),
  }),
  v.object({ intent: v.literal("confirm-assessor"), confirmed: v.optional(v.string()) }),
  v.object({ intent: v.literal("generate") }),
  v.object({ intent: v.literal("issue-link") }),
  v.object({ intent: v.literal("unlock") }),
  v.object({ intent: v.literal("remove-document"), documentId: v.pipe(v.string(), v.uuid()) }),
  v.object({
    intent: v.literal("ksi-review"),
    cmvpValidated: v.optional(v.picklist(["", "yes", "no"]), ""),
    cmvpNote: v.optional(v.string(), ""),
    logContextNote: v.optional(v.string(), ""),
  }),
]);

interface ActionResult {
  /** Shown in the "Package Overview JSON" card (save-inputs, confirm-assessor, generate). */
  error: string | null;
  saved?: boolean;
  /** Outcome of issue-link and unlock, shown in the "Intake link" section that triggered them. */
  linkMessage?: string;
  linkError?: string;
  /** Outcome of remove-document, shown in the "Documents" card. */
  documentsError?: string;
  /** Outcome of ksi-review, shown in the "Security indicators" card. */
  ksiMessage?: string;
  ksiError?: string;
  generated: { fileId: string; valid: boolean; problemCount: number } | null;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireStaffUser(request);
  const customerId = v.safeParse(CustomerId, params.customerId);
  if (!customerId.success) throw data("Customer not found", { status: 404 });
  try {
    const screen = await getPackageOverviewScreen(customerId.output);
    const intakeLink = await getIntakeLinkSection(customerId.output);
    const documents = await getDocumentsScreen(customerId.output);
    const ksis = await getKsisScreen(customerId.output);
    return { user, screen, intakeLink, documents, ksis };
  } catch (error) {
    if (error instanceof PackageOverviewError || error instanceof CustomerError) throw data(error.message, { status: error.status });
    throw error;
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireStaffUser(request);
  const customerId = v.safeParse(CustomerId, params.customerId);
  if (!customerId.success) throw data("Customer not found", { status: 404 });
  const input = v.safeParse(ActionInput, Object.fromEntries(await request.formData()));
  if (!input.success) {
    return data<ActionResult>({ error: "The form could not be read. Reload the page and try again.", generated: null }, { status: 400 });
  }

  try {
    switch (input.output.intent) {
      case "save-inputs":
        await savePackageOverviewInputs({ customerId: customerId.output, ...input.output });
        return data<ActionResult>({ error: null, saved: true, generated: null });
      case "confirm-assessor":
        await setAssessorConfirmed(customerId.output, input.output.confirmed !== undefined, user.id);
        return data<ActionResult>({ error: null, generated: null });
      case "issue-link":
        await issueNewIntakeLink(customerId.output, user.id);
        return data<ActionResult>({ error: null, generated: null, linkMessage: "A new link was issued. The old link no longer works." });
      case "unlock":
        await unlockIntake(customerId.output, user.id);
        return data<ActionResult>({ error: null, generated: null, linkMessage: "Unlocked. The customer can edit the intake again." });
      case "remove-document":
        await removeDocumentByStaff(customerId.output, input.output.documentId, user.id);
        return data<ActionResult>({ error: null, generated: null });
      case "ksi-review": {
        const { cmvpValidated, cmvpNote, logContextNote } = input.output;
        await saveKsiReview(customerId.output, { cmvpValidated: cmvpValidated === "" ? null : cmvpValidated === "yes", cmvpNote, logContextNote }, user.id);
        return data<ActionResult>({ error: null, generated: null, ksiMessage: "Saved." });
      }
      case "generate": {
        const outcome = await generatePackageOverviewForCustomer(customerId.output, user.id);
        return data<ActionResult>({
          error: null,
          generated: { fileId: outcome.file.id, valid: outcome.file.valid, problemCount: outcome.problems.length },
        });
      }
    }
  } catch (error) {
    const { intent } = input.output;
    const failed = (message: string, status: number) =>
      intent === "issue-link" || intent === "unlock"
        ? data<ActionResult>({ error: null, linkError: message, generated: null }, { status })
        : intent === "remove-document"
          ? data<ActionResult>({ error: null, documentsError: message, generated: null }, { status })
          : intent === "ksi-review"
            ? data<ActionResult>({ error: null, ksiError: message, generated: null }, { status })
            : data<ActionResult>({ error: message, generated: null }, { status });
    if (error instanceof IntakeDocumentError) return failed(error.message, error.status);
    if (error instanceof MissingAcronymError) return failed(error.message, 400);
    if (error instanceof PackageOverviewError || error instanceof CustomerError) return failed(error.message, error.status);
    if (error instanceof v.ValiError) return failed(error.message, 400);
    console.error(error);
    return failed("Could not generate the file. Nothing was saved.", 500);
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.screen.customer.name} · Package Overview JSON · ${PRODUCT_NAME}` : PRODUCT_NAME }];
}

const noticeClass = "rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm";

export default function CustomerPackage({ loaderData, actionData }: Route.ComponentProps) {
  const { user, screen, intakeLink, documents, ksis } = loaderData;
  const { customer, inputs, answers, status, latest, schemaVersion } = screen;
  const navigation = useNavigation();
  const submit = useSubmit();
  const busy = navigation.state !== "idle";
  const generating = busy && navigation.formData?.get("intent") === "generate";
  const knownPaths = new Set([LOGO_PATH, ...answers.flatMap((section) => [section.path, ...section.rows.map((row) => row.path)])]);
  const downloadHref = `/api/customers/${customer.id}/package-overview/download`;
  const justGenerated = Boolean(actionData?.generated && latest && actionData.generated.fileId === latest.id);

  return (
    <AppShell user={user}>
      <div className="grid gap-6">
        <header>
          <p className="text-sm text-muted-foreground">Customer page · Package Overview JSON</p>
          <h1 className="text-2xl font-semibold">{customer.name}</h1>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Intake link</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <IntakeLinkSection
              status={intakeLink.status}
              statusLabel={intakeLink.statusLabel}
              url={intakeLink.link.url}
              expired={intakeLink.link.expired}
              expiresAt={intakeLink.link.expiresAt}
              busy={busy}
            />
            {actionData?.linkError ? (
              <p role="alert" className="text-sm text-destructive">
                {actionData.linkError}
              </p>
            ) : actionData?.linkMessage ? (
              <p role="status" className="text-sm text-muted-foreground">
                {actionData.linkMessage}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Company &amp; service (tab 1)</CardTitle>
            <CardDescription>
              Everything the customer answered, read-only. To change an answer, unlock the form for the customer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnswersReadOnly sections={answers} logoUrl={screen.logoUrl} logoUploaded={screen.logoUploaded} packageIdFallback={screen.packageIdFallback} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security indicators (tab 2)</CardTitle>
            <CardDescription>The customer's answers, read-only, with the blocks that need a follow-up first. Answers are only stored.</CardDescription>
          </CardHeader>
          <CardContent>
            <KsisSection data={ksis} busy={busy} message={actionData?.ksiMessage} error={actionData?.ksiError} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documents (tab 3)</CardTitle>
            <CardDescription>
              What the customer uploaded, stored only: nothing reads the files. Remove hides a file on both sides; the stored copy stays.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {actionData?.documentsError && (
              <p role="alert" className="text-sm text-destructive">
                {actionData.documentsError}
              </p>
            )}
            <DocumentsSection customerId={customer.id} data={documents} busy={busy} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ignyte-only details</CardTitle>
            <CardDescription>
              Typed by Ignyte, never shown to the customer. They go into the file as the assessor and the advisors.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Form method="post" className="grid gap-4 sm:grid-cols-3">
              <input type="hidden" name="intent" value="save-inputs" />
              <div className="grid gap-1.5">
                <Label htmlFor="assessorName">Assessor name</Label>
                <Input id="assessorName" name="assessorName" className="scroll-mt-24" defaultValue={inputs.assessorName} maxLength={200} autoComplete="off" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="assessorId">FedRAMP assessor ID</Label>
                <Input
                  id="assessorId"
                  name="assessorId"
                  className="scroll-mt-24"
                  defaultValue={inputs.assessorId}
                  inputMode="numeric"
                  maxLength={20}
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="advisorName">Advisor</Label>
                <Input id="advisorName" name="advisorName" className="scroll-mt-24" defaultValue={inputs.advisorName} maxLength={200} autoComplete="off" />
              </div>
              <div className="sm:col-span-3">
                <Button type="submit" variant="outline" disabled={busy}>
                  Save
                </Button>
                {actionData?.saved && (
                  <span role="status" className="ml-3 text-sm text-muted-foreground">
                    Saved. Changing the assessor name or ID clears the confirmation below.
                  </span>
                )}
              </div>
            </Form>

            <Form method="post" className="grid gap-1" onChange={(event) => submit(event.currentTarget)}>
              <input type="hidden" name="intent" value="confirm-assessor" />
              <Label htmlFor="assessorConfirmed" className="cursor-pointer">
                <input
                  id="assessorConfirmed"
                  name="confirmed"
                  type="checkbox"
                  className="size-4 scroll-mt-24 accent-primary"
                  defaultChecked={inputs.assessorConfirmedAt !== null}
                  disabled={busy}
                />
                Assessor Confirmed on FedRAMP Marketplace
              </Label>
              <p className="pl-6 text-sm text-muted-foreground">
                {inputs.assessorConfirmedAt
                  ? `Confirmed by ${inputs.assessorConfirmedBy ?? "an Ignyte user"} on ${formatDateTime(inputs.assessorConfirmedAt)}.`
                  : "FedRAMP's template only checks that the ID has six digits. Check the Marketplace, then tick the box; until then the file stays a draft while an assessor name is entered."}
              </p>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Package Overview JSON</CardTitle>
            <CardDescription>
              Builds the file from tab 1 and the details above, then checks it against FedRAMP Package Overview {schemaVersion} and
              Ignyte's own checks.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Form method="post">
                <input type="hidden" name="intent" value="generate" />
                <Button type="submit" disabled={busy}>
                  {generating ? "Generating…" : latest ? "Regenerate JSON" : "Generate JSON"}
                </Button>
              </Form>
              {latest && status.downloadLabel && (
                <a
                  href={downloadHref}
                  download={latest.fileName}
                  className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
                >
                  {status.downloadLabel}
                </a>
              )}
            </div>

            {actionData?.error && (
              <p role="alert" className="text-sm text-destructive">
                {actionData.error}
              </p>
            )}

            {status.regenerate && (
              <p role="status" className={noticeClass}>
                Built on Package Overview {status.regenerate.builtOn}; FedRAMP&apos;s current is {status.regenerate.current}. Regenerate.
              </p>
            )}
            {status.answersChanged && (
              <p role="status" className={noticeClass}>
                Answers changed since this file was generated. Generate again.
              </p>
            )}

            {latest ? (
              <div className="grid gap-4">
                <div role="status" aria-live="polite">
                  {latest.valid ? (
                    <p className="rounded-md border border-green-600/40 bg-green-600/10 p-3 text-sm font-medium text-green-800">
                      ✓ Valid against FedRAMP Package Overview {latest.schemaVersion}
                    </p>
                  ) : (
                    <ProblemList problems={latest.problems} knownPaths={knownPaths} />
                  )}
                </div>

                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[minmax(10rem,auto)_1fr]">
                  <dt className="text-muted-foreground">{justGenerated ? "File just generated" : "Latest file"}</dt>
                  <dd className="font-mono">{latest.fileName}</dd>
                  <dt className="text-muted-foreground">FedRAMP format version</dt>
                  <dd>
                    Package Overview {latest.schemaVersion}{" "}
                    <span className="text-muted-foreground">(FedRAMP/schemas <span className="font-mono">{latest.schemaCommit}</span>)</span>
                  </dd>
                  <dt className="text-muted-foreground">FedRAMP rules version</dt>
                  <dd>
                    {latest.rulesVersion ?? (
                      <span className="text-muted-foreground">not recorded (generated before the rules were vendored)</span>
                    )}
                  </dd>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{formatDateTime(latest.generatedAt)}</dd>
                </dl>

                {latest.valid && <PublishingChecklist />}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No file generated yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
