import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/** Intake status (WI-003): the intake is locked while Submitted; Unlock returns it to In progress. */
export const intakeStatus = pgEnum("intake_status", ["not_started", "in_progress", "submitted"]);

/**
 * A customer of Ignyte (WI-003, Screens B and C). `name` is the company name. The intake link
 * token is never stored in clear: its SHA-256 for lookup and an AES-GCM copy so Copy can show it.
 * Fields added by WI-003 are nullable because rows created before it have none. WI-007 adds the
 * Ignyte-only Package Overview inputs.
 */
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  serviceName: text("service_name"),
  /** The boundary in plain words. */
  serviceDescription: text("service_description"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  status: intakeStatus("status").notNull().default("not_started"),
  intakeTokenHash: text("intake_token_hash").unique(),
  intakeTokenEncrypted: text("intake_token_encrypted"),
  intakeTokenIssuedAt: timestamp("intake_token_issued_at", { withTimezone: true }),
  /** issued_at + 30 days; the link is refused when now() >= expires_at. */
  intakeTokenExpiresAt: timestamp("intake_token_expires_at", { withTimezone: true }),
  intakeTokenIssuedBy: text("intake_token_issued_by").references(() => users.id, { onDelete: "set null" }),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
  unlockedBy: text("unlocked_by").references(() => users.id, { onDelete: "set null" }),
  /** FedRAMP 20x class (WI-004): "A" when tab 1 says 20x; the MVP onboards Class A only, B to D come later without a migration. */
  fedrampClass: text("fedramp_class"),
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
