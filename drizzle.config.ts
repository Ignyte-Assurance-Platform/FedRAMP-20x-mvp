import { defineConfig } from "drizzle-kit";

// drizzle-kit generate needs no database; migrate/studio read DATABASE_URL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema/index.ts",
  out: "./server/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://maaz:maaz@localhost:5432/maaz20x",
  },
  strict: true,
  verbose: true,
});
