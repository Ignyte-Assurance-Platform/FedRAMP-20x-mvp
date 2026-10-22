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
}

/**
 * Replaces a section's answers (ADR-0003 section save; the version check that makes it
 * optimistic arrives with WI-004). Bumps `version` and `updated_at` on every save.
 */
export async function upsertIntakeSection(db: Database, input: IntakeSectionInput): Promise<IntakeAnswersRow> {
  const [row] = await db
    .insert(schema.intakeAnswers)
    .values(input)
    .onConflictDoUpdate({
      target: [schema.intakeAnswers.customerId, schema.intakeAnswers.section],
      set: {
        answers: input.answers,
        formDefinitionVersion: input.formDefinitionVersion,
        version: sql`${schema.intakeAnswers.version} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error("upsert into intake_answers returned no row");
  return row;
}
