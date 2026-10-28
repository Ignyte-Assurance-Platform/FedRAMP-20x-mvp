import * as v from "valibot";
import { documentDownloadUrl, IntakeDocumentError, requireStaffUser } from "~server/services";
import type { Route } from "./+types/document-download";

/**
 * Download of one tab 3 file or earlier version (WI-006, Screen D): a redirect to a short-lived
 * signed GET of the stored object, always as an attachment under its original name, so an SVG
 * is never shown inline. The bucket is never public. Staff only.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireStaffUser(request, "api");
  const ids = v.safeParse(v.object({ customerId: v.pipe(v.string(), v.uuid()), documentId: v.pipe(v.string(), v.uuid()) }), params);
  if (!ids.success) return new Response("Not Found", { status: 404 });
  try {
    const url = await documentDownloadUrl(ids.output.customerId, ids.output.documentId);
    return new Response(null, { status: 302, headers: { Location: url, "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    if (error instanceof IntakeDocumentError) return new Response(error.message, { status: error.status });
    throw error;
  }
}
