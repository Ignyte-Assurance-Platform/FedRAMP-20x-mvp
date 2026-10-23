import { data, Form, Link, useNavigation } from "react-router";
import * as v from "valibot";
import { createCustomer, CustomerInput, requireStaffUser } from "~server/services";
import { CopyLink } from "~/components/copy-link";
import { AppShell } from "~/components/layout/app-shell";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { Route } from "./+types/customer-new";

/** Screen C (WI-003): create a customer; Save generates the intake link and shows it with Copy. Staff only. */

const FIELDS = ["name", "serviceName", "serviceDescription", "contactName", "contactEmail"] as const;
type Field = (typeof FIELDS)[number];

interface ActionResult {
  values: Partial<Record<Field, string>>;
  errors: Partial<Record<Field, string>>;
  formError: string | null;
  created: { id: string; name: string; link: string } | null;
}

export async function loader({ request }: Route.LoaderArgs) {
  return { user: await requireStaffUser(request) };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireStaffUser(request);
  const form = await request.formData();
  const values = Object.fromEntries(FIELDS.map((f) => [f, String(form.get(f) ?? "")])) as Record<Field, string>;
  const parsed = v.safeParse(CustomerInput, values);
  if (!parsed.success) {
    const errors: ActionResult["errors"] = {};
    for (const issue of parsed.issues) {
      const key = v.getDotPath(issue) as Field | null;
      if (key && !errors[key]) errors[key] = issue.message;
    }
    return data<ActionResult>({ values, errors, formError: null, created: null }, { status: 400 });
  }
  try {
    const { customer, link } = await createCustomer(parsed.output, user.id);
    return data<ActionResult>({ values: {}, errors: {}, formError: null, created: { id: customer.id, name: customer.name, link } });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return data<ActionResult>({ values, errors: {}, formError: "The customer was not saved. Try again.", created: null }, { status: 500 });
  }
}

export function meta() {
  return [{ title: "Create customer · Maaz 20x" }];
}

const LABELS: Record<Field, { label: string; required: boolean; type?: string; hint?: string }> = {
  name: { label: "Company name", required: true },
  serviceName: { label: "Service name", required: true },
  serviceDescription: { label: "Service description", required: false, hint: "The boundary in plain words." },
  contactName: { label: "Primary contact name", required: true },
  contactEmail: { label: "Primary contact email", required: true, type: "email" },
};

export default function CustomerNew({ loaderData, actionData }: Route.ComponentProps) {
  const { user } = loaderData;
  const saving = useNavigation().state === "submitting";
  const created = actionData?.created;

  return (
    <AppShell user={user}>
      <div className="grid max-w-2xl gap-6">
        <header>
          <Link to="/customers" className="text-sm text-muted-foreground hover:underline">
            ← Customers
          </Link>
          <h1 className="text-2xl font-semibold">Create customer</h1>
        </header>

        {created ? (
          <Card>
            <CardHeader>
              <CardTitle>{created.name} was created</CardTitle>
              <CardDescription>Send this link to the customer. It expires in 30 days; you can issue a new one on the customer page.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <CopyLink url={created.link} />
              <div className="flex gap-3 text-sm">
                <Link to={`/customers/${created.id}/package`} className="underline">
                  Open the customer page
                </Link>
                <Link to="/customers" className="underline">
                  Back to customers
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <Form method="post" noValidate className="grid gap-4">
                {FIELDS.map((field) => {
                  const { label, required, type, hint } = LABELS[field];
                  const error = actionData?.errors[field];
                  const describedBy = [hint ? `${field}-hint` : "", error ? `${field}-error` : ""].filter(Boolean).join(" ") || undefined;
                  return (
                    <div key={field} className="grid gap-1.5">
                      <Label htmlFor={field}>
                        {label}
                        {required ? <span aria-hidden="true"> *</span> : <span className="font-normal text-muted-foreground"> (optional)</span>}
                      </Label>
                      {field === "serviceDescription" ? (
                        <textarea
                          id={field}
                          name={field}
                          rows={3}
                          defaultValue={actionData?.values[field]}
                          aria-describedby={describedBy}
                          className="rounded-md border bg-transparent px-3 py-2 text-sm"
                        />
                      ) : (
                        <Input
                          id={field}
                          name={field}
                          type={type ?? "text"}
                          required={required}
                          defaultValue={actionData?.values[field]}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={describedBy}
                          autoComplete="off"
                        />
                      )}
                      {hint && (
                        <p id={`${field}-hint`} className="text-xs text-muted-foreground">
                          {hint}
                        </p>
                      )}
                      {error && (
                        <p id={`${field}-error`} className="text-sm text-destructive">
                          {error}
                        </p>
                      )}
                    </div>
                  );
                })}
                {actionData?.formError && (
                  <p role="alert" className="text-sm text-destructive">
                    {actionData.formError}
                  </p>
                )}
                <div>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </Form>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
