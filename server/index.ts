/**
 * The only entry point of the app (ADR-0006 rule 8). It serves:
 * - built static assets with long-lived immutable cache headers (ADR-0005),
 * - Better Auth under /api/auth/*,
 * - the local storage driver's signed URLs under /api/uploads/:token (404 with Cloud Storage),
 *   outside React Router because a resumable session answers 308 without a Location header,
 * - everything else through React Router (pages, data requests, resource routes),
 *   with Cache-Control: no-store unless a handler set something else.
 * In development it also runs Vite in middleware mode for HMR.
 */
import { createServer, type Server } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type MiddlewareHandler } from "hono";
import { createRequestHandler, type ServerBuild } from "react-router";
import { getAuth } from "~server/auth";
import { getEnv } from "~server/config";
import { closeDb } from "~server/db";
import { getRulesLibrary } from "~server/fedramp";
import { withPublicOrigin } from "~server/http/public-origin";
import { getPackageOverviewGenerator, handleLocalStorageRequest } from "~server/services";

export const IMMUTABLE = "public, max-age=31536000, immutable";
export const NO_STORE = "no-store";
export const PUBLIC_FILE = "public, max-age=86400";

const root = path.resolve(import.meta.dirname, "..");
const clientDir = path.join(root, "build", "client");

export interface AppOptions {
  /** Loads the React Router server build (production build, or Vite's virtual module in dev). */
  getBuild: () => Promise<ServerBuild>;
  mode: "development" | "production";
  /**
   * Public origin of the app (APP_URL). In production React Router gets each request on this
   * origin, because behind Cloud Run the container sees http while the browser uses https (WI-016).
   */
  publicOrigin?: string;
}

export function createApp({ getBuild, mode, publicOrigin }: AppOptions): Hono {
  const app = new Hono();

  // Default every response to no-store; static assets override below. Customer data must
  // never be cached by the browser or a proxy (ADR-0005).
  app.use("*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", NO_STORE);
  });

  if (mode === "production") {
    // Absolute, so the entry point works from any working directory.
    const staticRoot = clientDir;
    const cacheFound =
      (value: string): MiddlewareHandler =>
      async (c, next) => {
        await next();
        if (c.res.status === 200 && !c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", value);
      };
    // Vite emits content-hashed file names under /assets, so they never change.
    app.use("/assets/*", cacheFound(IMMUTABLE), serveStatic({ root: staticRoot }));
    // Self-hosted fonts from public/fonts (WI-015): un-hashed names, so cached for a day only.
    app.use("/fonts/*", cacheFound(PUBLIC_FILE), serveStatic({ root: staticRoot }));
  }

  app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth().handler(c.req.raw));
  // The local driver's upload, session and download URLs. A session part answers 308 with a Range
  // header and no Location, as Cloud Storage does; React Router would take that for a redirect.
  app.on(["GET", "PUT"], "/api/uploads/:token", (c) => handleLocalStorageRequest(c.req.param("token"), c.req.raw));

  const handleRequest = createRequestHandler(getBuild, mode);
  const toPublic = mode === "production" && publicOrigin ? (r: Request) => withPublicOrigin(r, publicOrigin) : (r: Request) => r;
  app.all("*", (c) => handleRequest(toPublic(c.req.raw)));

  return app;
}

export async function startServer(): Promise<Server> {
  const env = getEnv(); // throws, and the process exits, on a bad config or DEV_LOGIN in production
  getPackageOverviewGenerator(); // throws, and the process exits, when a vendored schema does not match schemas/manifest.json (WI-007 §5)
  getRulesLibrary(); // the same for the vendored FedRAMP rules: hash and schema of every version folder (WI-005 E1)
  const mode = env.NODE_ENV === "production" ? "production" : "development";

  let server: Server;
  if (mode === "development") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: "custom" });
    const app = createApp({
      mode,
      getBuild: () => vite.ssrLoadModule("virtual:react-router/server-build") as Promise<ServerBuild>,
    });
    const listener = getRequestListener(app.fetch);
    server = createServer((req, res) => vite.middlewares(req, res, () => listener(req, res)));
  } else {
    const buildFile = pathToFileURL(path.join(root, "build", "server", "index.js")).href;
    const build = (await import(buildFile)) as ServerBuild;
    const app = createApp({ mode, getBuild: async () => build, publicOrigin: env.APP_URL });
    server = createServer(getRequestListener(app.fetch));
  }

  await new Promise<void>((resolve) => server.listen(env.PORT, resolve));
  console.log(`Maaz 20x (${mode}) listening on ${env.APP_URL}` + (env.devLoginEnabled ? " (dev sign-in ON)" : ""));

  const shutdown = () => {
    server.close(() => void closeDb().finally(() => process.exit(0)));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startServer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
