import { createHash } from "node:crypto";
import path from "node:path";
import * as v from "valibot";

/** Optional text where an empty value (`GCS_BUCKET=` in .env) means "not set". */
const optionalText = v.optional(
  v.pipe(
    v.string(),
    v.trim(),
    v.transform((s) => (s === "" ? undefined : s)),
  ),
);

const EnvSchema = v.object({
  NODE_ENV: v.optional(v.picklist(["development", "test", "production"]), "development"),
  PORT: v.optional(v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(1), v.maxValue(65535)), "3000"),
  APP_URL: v.optional(v.pipe(v.string(), v.url()), "http://localhost:3000"),
  DATABASE_URL: v.pipe(v.string(), v.startsWith("postgres", "DATABASE_URL must be a postgres:// URL")),

  BETTER_AUTH_SECRET: v.pipe(v.string(), v.minLength(32, "BETTER_AUTH_SECRET must be at least 32 characters")),
  DEV_LOGIN: v.optional(v.string()),
  DEV_LOGIN_EMAIL: v.optional(v.pipe(v.string(), v.email()), "dev@ignyteplatform.com"),
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
  GOOGLE_ALLOWED_DOMAIN: v.optional(v.string(), "ignyteplatform.com"),
  ADMIN_EMAILS: v.optional(v.string(), ""),

  STORAGE_DRIVER: v.optional(v.picklist(["local", "gcs"]), "local"),
  LOCAL_STORAGE_DIR: v.optional(v.string(), ".data/storage"),
  GCS_BUCKET: optionalText,
  /** Public bucket that holds nothing but customer logos (WI-018); local stand-in: LOCAL_LOGO_DIR. */
  GCS_LOGO_BUCKET: optionalText,
  LOCAL_LOGO_DIR: v.optional(v.string(), ".data/logos"),
  /** AES-256-GCM key for the stored copy of intake link tokens (WI-003), 32 bytes in base64; from Secret Manager in production. */
  INTAKE_LINK_KEY: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.transform((s) => (s === "" ? undefined : s)),
      v.optional(v.pipe(v.string(), v.check((s) => Buffer.from(s, "base64").length === 32, "INTAKE_LINK_KEY must be 32 bytes in base64"))),
    ),
  ),
  /** Public base URL of the logos Ignyte hosts (WI-007): the only host Generate JSON requests. */
  LOGO_PUBLIC_BASE_URL: v.optional(v.pipe(v.string(), v.trim(), v.transform((s) => (s === "" ? undefined : s)), v.optional(v.pipe(v.string(), v.url())))),
});

type RawEnv = v.InferOutput<typeof EnvSchema>;

export type Env = RawEnv & {
  /** True only when NODE_ENV=development AND DEV_LOGIN=1. */
  devLoginEnabled: boolean;
  /** Google sign-in is configured but inactive until the OAuth client exists (ADR-0004). */
  googleEnabled: boolean;
  adminEmails: string[];
  /** INTAKE_LINK_KEY decoded; outside production derived from BETTER_AUTH_SECRET when unset. */
  intakeLinkKey: Buffer;
};

export class ConfigError extends Error {
  override name = "ConfigError";
}

/**
 * Parses and checks the environment. Pure: takes the variables as input so tests can
 * prove the production guard without touching process.env.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = v.safeParse(EnvSchema, source);
  if (!result.success) {
    const lines = result.issues.map((i) => `  - ${v.getDotPath(i) ?? "env"}: ${i.message}`);
    throw new ConfigError(`Invalid environment:\n${lines.join("\n")}`);
  }
  const env = result.output;

  // WI-010 §4: a dev-only login must never be honoured in production. Any value counts,
  // including "0" or "", so a stray variable is caught rather than silently ignored.
  if (env.NODE_ENV === "production" && source.DEV_LOGIN !== undefined) {
    throw new ConfigError(
      "Refusing to start: DEV_LOGIN is set while NODE_ENV=production. " +
        "The dev-only sign-in exists for local development only; remove DEV_LOGIN from the environment.",
    );
  }
  // WI-005 E1: the vendored rules are the ones in the image; another root is for tests only.
  if (env.NODE_ENV === "production" && source.FEDRAMP_RULES_DIR !== undefined) {
    throw new ConfigError(
      "Refusing to start: FEDRAMP_RULES_DIR is set while NODE_ENV=production. " +
        "It points the FedRAMP rules loader at test fixtures; remove it from the environment.",
    );
  }
  // Local disk on Cloud Run is ephemeral: customer files would vanish on the next restart.
  if (env.NODE_ENV === "production" && env.STORAGE_DRIVER !== "gcs") {
    throw new ConfigError(
      "Refusing to start: STORAGE_DRIVER must be gcs in production (local disk on Cloud Run is ephemeral).",
    );
  }
  if (env.STORAGE_DRIVER === "gcs" && !env.GCS_BUCKET) {
    throw new ConfigError("Invalid environment:\n  - GCS_BUCKET: required when STORAGE_DRIVER=gcs");
  }
  if (env.STORAGE_DRIVER === "gcs" && !env.GCS_LOGO_BUCKET) {
    throw new ConfigError("Invalid environment:\n  - GCS_LOGO_BUCKET: required when STORAGE_DRIVER=gcs (the public bucket for customer logos)");
  }
  if (env.GCS_LOGO_BUCKET && env.GCS_LOGO_BUCKET === env.GCS_BUCKET) {
    throw new ConfigError("Invalid environment:\n  - GCS_LOGO_BUCKET must not be the documents bucket (GCS_BUCKET): logos are public, documents never are");
  }
  // WI-007: the Package Overview carries the public address of the hosted logo; without the
  // host no customer file can ever pass, so a production start without it is a mistake.
  if (env.NODE_ENV === "production" && !env.LOGO_PUBLIC_BASE_URL) {
    throw new ConfigError(
      "Refusing to start: LOGO_PUBLIC_BASE_URL must be set in production (Generate JSON publishes the hosted logo address).",
    );
  }
  if (env.NODE_ENV === "production" && !env.INTAKE_LINK_KEY) {
    throw new ConfigError(
      "Refusing to start: INTAKE_LINK_KEY must be set in production (it encrypts the stored intake links).",
    );
  }
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    throw new ConfigError("Invalid environment:\n  - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together");
  }

  return {
    ...env,
    devLoginEnabled: env.NODE_ENV === "development" && env.DEV_LOGIN === "1",
    googleEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    adminEmails: env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
    intakeLinkKey: env.INTAKE_LINK_KEY
      ? Buffer.from(env.INTAKE_LINK_KEY, "base64")
      : createHash("sha256").update(`maaz-intake-link:${env.BETTER_AUTH_SECRET}`).digest(),
  };
}

let cached: Env | undefined;

/** Loads `.env` (outside production) once, then parses process.env. */
export function getEnv(): Env {
  if (cached) return cached;
  if (process.env.NODE_ENV !== "production") {
    try {
      // Resolved from the repo root, so the entry point works from any working directory.
      process.loadEnvFile(path.resolve(import.meta.dirname, "../../.env"));
    } catch {
      // no .env file: rely on the real environment
    }
  }
  cached = parseEnv(process.env);
  return cached;
}
