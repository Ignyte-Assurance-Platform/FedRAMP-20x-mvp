import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { customers } from "./customers";

/**
 * One row per customer and intake section (ADR-0003: section save with a version check).
 * Minimal on purpose; WI-004/005 own the section contents.
 */
export const intakeAnswers = pgTable(
  "intake_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    formDefinitionVersion: text("form_definition_version").notNull(),
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull().default({}),
    /** Optimistic-lock counter: a row is created at 1 by its first save (at-risk note 14). */
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("intake_answers_customer_section_uq").on(t.customerId, t.section)],
);
