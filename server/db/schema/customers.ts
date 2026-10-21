import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Minimal on purpose: WI-003 (customers) owns the real columns and is waiting on answers.
 * The skeleton only needs a row that documents and intake answers can hang off; WI-007
 * adds the Ignyte-only Package Overview inputs.
 */
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  // WI-007 §4: Ignyte-only inputs of the Package Overview, never shown to the customer.
  assessorName: text("assessor_name"),
  assessorId: text("assessor_id"),
  /** "Assessor Confirmed on FedRAMP Marketplace"; cleared when the name or ID changes. */
  assessorConfirmedAt: timestamp("assessor_confirmed_at", { withTimezone: true }),
  assessorConfirmedBy: text("assessor_confirmed_by").references(() => users.id, { onDelete: "set null" }),
  /** Ignyte's entry in `advisors` (decision E1); empty adds none. */
  advisorName: text("advisor_name").notNull().default("Ignyte"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
