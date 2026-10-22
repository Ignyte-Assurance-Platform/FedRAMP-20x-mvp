import * as v from "valibot";
import { downloadPackageOverview, PackageOverviewError, requireStaffUser } from "~server/services";
import { attachmentDisposition } from "~server/storage";
import type { Route } from "./+types/package-overview-download";

/**
 * Download of the latest Package Overview file (WI-007 §3): the stored bytes, never a
 * rebuild, under the stored name (`…-DRAFT.json` when it did not pass). Staff only.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireStaffUser(request, "api");
  const customerId = v.safeParse(v.pipe(v.string(), v.uuid()), params.customerId);
  if (!customerId.success) return new Response("Not Found", { status: 404 });
  try {
    const file = await downloadPackageOverview(customerId.output);
    return new Response(file.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": attachmentDisposition(file.fileName),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof PackageOverviewError) return new Response(error.message, { status: error.status });
    throw error;
  }
}
