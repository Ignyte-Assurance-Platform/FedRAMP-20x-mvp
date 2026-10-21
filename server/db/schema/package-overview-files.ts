import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { users } from "./users";

export interface StoredProblem {
  path: string;
  question: string;
  message: string;
  raw: string;
}

/**
 * One row per "Generate JSON" (WI-007 §4). Download always serves `json` of the latest
 * row, never a rebuild. A draft is a row with valid = false (no separate column).
 */
export const packageOverviewFiles = pgTable(
  "package_overview_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    generatedBy: text("generated_by").references(() => users.id, { onDelete: "set null" }),
    schemaVersion: text("schema_version").notNull(),
    schemaCommit: text("schema_commit").notNull(),
    /** FedRAMP rules version at generation time; null until WI-012 vendors the rules. */
    rulesVersion: text("rules_version"),
    valid: boolean("valid").notNull(),
    errors: jsonb("errors").$type<StoredProblem[]>().notNull().default([]),
    /** When tab 1 answers were last saved, to tell "answers changed since this file". */
    answersUpdatedAt: timestamp("answers_updated_at", { withTimezone: true }),
    fileName: text("file_name").notNull(),
    /** The exact bytes that are downloaded. */
    json: text("json").notNull(),
  },
  (t) => [index("package_overview_files_customer_generated_idx").on(t.customerId, t.generatedAt)],
);
