import * as v from "valibot";
import {
  finishDocumentUpload,
  finishLogoUpload,
  removeDocumentByCustomer,
  saveCertification,
  saveIntake,
  startDocumentUpload,
  startLogoUpload,
  submitTab1,
  updateDocument,
} from "~server/services";
import type { Route } from "./+types/intake.$token";

/**
 * Screen E writes, as JSON: tab 1's Save, autosave, Submit and logo upload (WI-004), and tab 3's
 * certification and documents (WI-006: start/finish an upload, rename and "What is this?", x). The
 * customer comes from the token only (E5). Answers: 200 saved, 409 conflict (the stored answers
 * come back), 410 expired or replaced link, 423 submitted (read-only), 422 Submit problems,
 * 400 refused logo or unreadable request. Nothing is stored on any non-200 answer.
 */

const Body = v.variant("intent", [
  v.object({ intent: v.literal("save"), answers: v.record(v.string(), v.unknown()), version: v.number() }),
  v.object({ intent: v.literal("submit"), answers: v.record(v.string(), v.unknown()), version: v.number() }),
  v.object({ intent: v.literal("logo-start"), filename: v.string(), contentType: v.string(), size: v.number(), width: v.optional(v.number()) }),
  v.object({ intent: v.literal("logo-finish"), logoId: v.string(), filename: v.string(), contentType: v.string() }),
  v.object({ intent: v.literal("certification-save"), certification: v.record(v.string(), v.unknown()), version: v.number() }),
  v.object({ intent: v.literal("document-start"), filename: v.string(), contentType: v.string(), size: v.number(), replaces: v.optional(v.string()) }),
  v.object({ intent: v.literal("document-finish"), documentId: v.string(), filename: v.string(), size: v.number(), replaces: v.optional(v.string()) }),
  v.object({
    intent: v.literal("document-update"),
    documentId: v.string(),
    displayName: v.optional(v.string()),
    kind: v.optional(v.nullable(v.string())),
    kindNote: v.optional(v.nullable(v.string())),
    policyVersion: v.optional(v.nullable(v.string())),
    policyUpdatedOn: v.optional(v.nullable(v.string())),
  }),
  v.object({ intent: v.literal("document-remove"), documentId: v.string() }),
]);

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: HEADERS });
}

const STATUS = { expired: 410, locked: 423, conflict: 409, problems: 422, refused: 400 } as const;

/** Tab 1 answers are a few KB of text; anyone holding a link can post here, so the body is capped. */
export const INTAKE_BODY_MAX_BYTES = 256 * 1024;

/**
 * Reads the body as JSON, stopping at `max` bytes whatever Content-Length claims (chunked
 * bodies have none). "too-large" past the cap, null when it is not JSON.
 */
export async function readJsonCapped(request: Request, max = INTAKE_BODY_MAX_BYTES): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return "too-large";
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return "too-large";
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function run(token: string, body: v.InferOutput<typeof Body>) {
  switch (body.intent) {
    case "save":
      return saveIntake(token, body);
    case "submit":
      return submitTab1(token, body);
    case "logo-start":
      return startLogoUpload(token, body);
    case "logo-finish":
      return finishLogoUpload(token, body);
    case "certification-save":
      // The service parses the certification itself; a malformed one is a ValiError (400).
      return saveCertification(token, body as unknown as Parameters<typeof saveCertification>[1]);
    case "document-start":
      return startDocumentUpload(token, body);
    case "document-finish":
      return finishDocumentUpload(token, body);
    case "document-update":
      return updateDocument(token, body);
    case "document-remove":
      return removeDocumentByCustomer(token, body);
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return json({ kind: "refused", message: "Method not allowed" }, 405);
  const raw = await readJsonCapped(request);
  if (raw === "too-large") return json({ kind: "refused", message: "The form is too large to save. Shorten the longest answers and try again." }, 413);
  const parsed = v.safeParse(Body, raw);
  if (!parsed.success) return json({ kind: "refused", message: "The request could not be read. Reload the page and try again." }, 400);
  const body = parsed.output;
  try {
    const outcome = await run(params.token, body);
    return json(outcome, STATUS[outcome.kind as keyof typeof STATUS] ?? 200);
  } catch (error) {
    if (error instanceof v.ValiError) return json({ kind: "refused", message: "The request could not be read. Reload the page and try again." }, 400);
    throw error;
  }
}

export function loader() {
  return json({ kind: "refused", message: "Not Found" }, 404);
}
