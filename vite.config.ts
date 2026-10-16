import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

const root = import.meta.dirname;
const serverDir = path.join(root, "server") + path.sep;

/**
 * ADR-0006 rule 2: server/ must never reach the browser bundle. React Router strips
 * loaders/actions from the client build; anything from server/ that survives that is a
 * leak, so the client build fails instead of shipping it.
 */
function serverOnlyGuard(): Plugin {
  return {
    name: "maaz:server-only-guard",
    enforce: "post",
    applyToEnvironment: (env) => env.name === "client",
    load(id) {
      if (path.normalize(id).startsWith(serverDir)) {
        throw new Error(`server-only module reached the client bundle: ${id}`);
      }
      return null;
    },
  };
}

export default defineConfig({
  resolve: {
    alias: [
      { find: /^~server\/(.*)$/, replacement: path.join(root, "server/$1") },
      { find: /^~\/(.*)$/, replacement: path.join(root, "app/$1") },
    ],
  },
  plugins: [tailwindcss(), reactRouter(), serverOnlyGuard()],
  ssr: {
    // server/ is outside app/, so keep its heavy deps external to the SSR bundle.
    external: ["postgres", "@google-cloud/storage", "better-auth"],
  },
});
