import { Link, useNavigate } from "react-router";
import { listCustomers, requireStaffUser } from "~server/services";
import { CopyLink } from "~/components/copy-link";
import { AppShell } from "~/components/layout/app-shell";
import { buttonVariants } from "~/components/ui/button";
import { formatDate } from "~/lib/dates";
import { PRODUCT_NAME } from "~/lib/product";
import type { Route } from "./+types/customers-list";

/** Screen B (WI-003): every customer, newest first; a row opens Screen D. Staff only. */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireStaffUser(request);
  return { user, customers: await listCustomers() };
}

export function meta() {
  return [{ title: `Customers · ${PRODUCT_NAME}` }];
}

const statusClass: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-500/15 text-amber-800",
  submitted: "bg-green-600/15 text-green-800",
};

export default function CustomersList({ loaderData }: Route.ComponentProps) {
  const { user, customers } = loaderData;
  const navigate = useNavigate();

  return (
    <AppShell user={user}>
      <div className="grid gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Customers</h1>
          <Link to="/customers/new" className={buttonVariants()}>
            Create customer
          </Link>
        </header>

        {customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No customers yet. Create the first one.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Company</th>
                  <th scope="col" className="px-3 py-2 font-medium">Service</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 font-medium">Intake link</th>
                  <th scope="col" className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const href = `/customers/${customer.id}/package`;
                  return (
                    <tr
                      key={customer.id}
                      className="cursor-pointer border-t hover:bg-muted/30"
                      onClick={(event) => {
                        // The Copy controls stay usable inside a clickable row.
                        if ((event.target as HTMLElement).closest("button, input, a")) return;
                        navigate(href);
                      }}
                    >
                      <td className="px-3 py-2">
                        <Link to={href} className="font-medium text-foreground underline-offset-2 hover:underline">
                          {customer.name}
                        </Link>
                        {customer.regenerate && (
                          <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-800">
                            Regenerate
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{customer.serviceName ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusClass[customer.status]}`}>
                          {customer.statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <CopyLink url={customer.link.url} label={`Intake link for ${customer.name}`} truncate />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(customer.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
