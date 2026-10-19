// @ts-check
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Import rules of ADR-0006 (rules 2 and 8):
 * - server/ is reached only through one alias per module (~server/db, ~server/fedramp,
 *   ~server/storage, ...), never by a relative path;
 * - outside server/, only a module's entry is imported (~server/db, not ~server/db/client);
 * - shared components, hooks, lib and route-private components never import server/ at all.
 *   Route modules may, for their loaders and actions; the Vite client build fails if any
 *   server code survives into the browser bundle (vite.config.ts, serverOnlyGuard).
 */
const relativeIntoServer = {
  regex: "^(\\.\\./)+(\\.\\./)*server(/|$)",
  message: "Import server code through its module alias (~server/db, ~server/fedramp, ~server/storage, ...), never by a relative path (ADR-0006 rule 8).",
};
const deepServerImport = {
  regex: "^~server/[^/]+/.+",
  message: "Import a server module through its entry (~server/<module>), not its internal files (ADR-0006 rule 8).",
};
const anyServerImport = {
  regex: "^(~server(/|$)|(\\.\\./)+server(/|$))",
  message: "Components, hooks and lib are browser code and never import server/ (ADR-0006 rule 2). Load data in the route's loader instead.",
};
// Inside server/, a relative path may go one level up within its own module
// (storage/local → storage/document-store) but never into a sibling module.
const SERVER_MODULES = "(config|auth|db|repositories|services|storage|fedramp|cache)";
const leaveServerModule = {
  regex: `^(\\.\\./){2,}|^\\.\\./${SERVER_MODULES}(/|$)`,
  message: "Inside server/, reach another module through ~server/<module>, not a relative path (ADR-0006 rule 8).",
};

export default tseslint.config(
  {
    ignores: ["build/**", ".react-router/**", "node_modules/**", "docs/**", ".agents/**", ".claude/**", ".data/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    ignores: ["server/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [relativeIntoServer, deepServerImport] }],
    },
  },
  {
    files: ["server/**/*.ts"],
    ignores: ["server/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [leaveServerModule] }],
    },
  },
  {
    files: ["app/components/**", "app/hooks/**", "app/lib/**", "app/routes/**/components/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [anyServerImport] }],
    },
  },
);
