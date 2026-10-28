import { bigint, boolean, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { customers } from "./customers";

/**
 * Columns follow the brain contract "customer document storage layout" §3. The company logo
 * (customers/<id>/logo/…) and the intake documents of tab 3 (customers/<id>/intake/…, WI-006 §4)
 * share the table; the tab 3 columns stay null for logos.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    objectPath: text("object_path").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    contentType: text("content_type").notNull(),
    /** Filled for the logo, whose bytes the app reads; null for documents until the post-MVP pipeline reads them (WI-006 §8.2). */
    sha256: text("sha256"),
    /** Base64 MD5 and CRC32C Cloud Storage computed for the object, recorded when a document upload finishes. */
    md5: text("md5"),
    crc32c: text("crc32c"),
    /** "user:<id>" or "link:<token id>" — who uploaded it. */
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    /** Tab 3 (WI-006 §4): the name shown in the lists; Rename changes only this. */
    displayName: text("display_name"),
    /** "What is this?": an item key of form-definitions/documents.v1.json, or "other" with kind_note. */
    kind: text("kind"),
    kindNote: text("kind_note"),
    policyVersion: text("policy_version"),
    policyUpdatedOn: date("policy_updated_on", { mode: "string" }),
    addedAfterSubmit: boolean("added_after_submit").notNull().default(false),
    /** Replace: the new row points at the version it replaces, which gets superseded_at. */
    replacesDocumentId: uuid("replaces_document_id"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    /** Soft removal: the row is hidden on both sides and the object stays in the bucket (WI-006 §8.4). */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedBy: text("removed_by"),
  },
  (t) => [index("documents_customer_id_idx").on(t.customerId)],
);
