/** Object paths and upload limits from the brain contract "customer document storage layout". */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Contract §2: PDF, Word, Excel. */
export const ALLOWED_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/** Contract §2: 100 MB per file for the MVP. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * Keeps the original name readable but safe as one path segment: no separators,
 * no traversal, no control characters, at most 200 characters.
 */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex -- removing control characters is the point
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(-200);
  return cleaned.length > 0 ? cleaned : "file";
}

/** customers/<customer-id>/intake/<document-id>/<original-filename> */
export function intakeObjectPath(customerId: string, documentId: string, filename: string): string {
  if (!UUID.test(customerId)) throw new Error(`invalid customer id: ${customerId}`);
  if (!UUID.test(documentId)) throw new Error(`invalid document id: ${documentId}`);
  return `customers/${customerId}/intake/${documentId}/${safeFilename(filename)}`;
}

/** Rejects anything that is not a clean relative path under customers/. */
export function assertObjectPath(objectPath: string): void {
  const parts = objectPath.split("/");
  const bad =
    parts[0] !== "customers" ||
    parts.length < 2 ||
    parts.some((p) => p === "" || p === "." || p === "..") ||
    objectPath.includes("\\");
  if (bad) throw new Error(`invalid object path: ${objectPath}`);
}
