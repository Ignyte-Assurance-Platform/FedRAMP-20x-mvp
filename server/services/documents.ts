import { getDocumentStore, LocalDocumentStore } from "~server/storage";

/**
 * Serves the local driver's signed URLs (dev-only route api/uploads/:token): single uploads, the
 * parts of a resumable session, and downloads. With the Cloud Storage driver the browser talks to
 * the bucket, so this answers 404. Tab 3's upload flow itself is in intake-documents.ts (WI-006).
 */
export async function handleLocalStorageRequest(token: string, request: Request): Promise<Response> {
  const store = getDocumentStore();
  if (!(store instanceof LocalDocumentStore)) return new Response("not found", { status: 404 });
  if (request.method === "PUT") return store.put(token, request);
  if (request.method === "GET") return store.send(token);
  return new Response("method not allowed", { status: 405, headers: { allow: "GET, PUT" } });
}
