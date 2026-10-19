import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;
const alias = [
  { find: /^~server\/(.*)$/, replacement: path.join(root, "server/$1") },
  { find: /^~\/(.*)$/, replacement: path.join(root, "app/$1") },
];

export default defineConfig({
  resolve: { alias },
  test: {
    // Coverage is measured on the unit project only (`npm run test:coverage`).
    // Thresholds are a floor, not a goal: raise them as tests land, never lower them.
    coverage: {
      provider: "v8",
      include: ["app/**/*.{ts,tsx}", "server/**/*.ts", "scripts/**/*.mjs"],
      exclude: ["**/*.test.*", "app/routes.ts", "server/db/migrate.ts", "server/db/seed.ts"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 28, statements: 28, functions: 20, branches: 30 },
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["{app,server,scripts}/**/*.test.{ts,tsx}", "tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "smoke",
          include: ["tests/smoke/**/*.test.ts"],
          environment: "node",
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
