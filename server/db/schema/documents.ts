import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { customers } from "./customers";

/** Columns follow the brain contract "customer document storage layout" §3. */
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
    sha256: text("sha256").notNull(),
    /** "user:<id>" or "link:<token id>" — who uploaded it. */
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_customer_id_idx").on(t.customerId)],
);
