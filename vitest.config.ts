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
