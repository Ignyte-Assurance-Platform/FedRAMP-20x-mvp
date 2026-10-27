import { and, eq, sql } from "drizzle-orm";
import { schema, type Database } from "~server/db";

export type IntakeAnswersRow = typeof schema.intakeAnswers.$inferSelect;

/** The stored answers of one intake section (tab) for a customer. */
export async function findIntakeSection(db: Database, customerId: string, section: string): Promise<IntakeAnswersRow | undefined> {
  return db.query.intakeAnswers.findFirst({
    where: and(eq(schema.intakeAnswers.customerId, customerId), eq(schema.intakeAnswers.section, section)),
  });
}

export interface IntakeSectionInput {
  customerId: string;
  section: string;
  formDefinitionVersion: string;
  answers: Record<string, unknown>;
  /** The version the page loaded; 0 when the section had no row yet. */
  expectedVersion: number;
}

export type IntakeSaveResult = { saved: IntakeAnswersRow } | { conflict: IntakeAnswersRow } | { stale: true };

/**
 * Versioned section save (WI-004 E2, ADR-0003): writes only if `expectedVersion` is still the
 * stored one, bumps it and returns the row; otherwise stores nothing and returns the stored row
 * as a conflict. The first save inserts version 1 and conflicts if another window got there
 * first. This is the only write to intake_answers.
 */
export async function saveIntakeSection(db: Database, input: IntakeSectionInput): Promise<IntakeSaveResult> {
  const { expectedVersion, ...values } = input;
  const where = and(eq(schema.intakeAnswers.customerId, input.customerId), eq(schema.intakeAnswers.section, input.section));
  const [row] =
    expectedVersion === 0
      ? await db.insert(schema.intakeAnswers).values({ ...values, version: 1 }).onConflictDoNothing().returning()
      : await db
          .update(schema.intakeAnswers)
          .set({
            answers: values.answers,
            formDefinitionVersion: values.formDefinitionVersion,
            version: sql`${schema.intakeAnswers.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(where, eq(schema.intakeAnswers.version, expectedVersion)))
          .returning();
  if (row) return { saved: row };
  const current = await findIntakeSection(db, input.customerId, input.section);
  // A version the section never had (no row yet, or a crafted request): nothing to conflict with.
  if (!current) return { stale: true };
  return { conflict: current };
}
