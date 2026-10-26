import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** WI-003 E4: the link expires 30 days after it is issued. */
export const INTAKE_LINK_DAYS = 30;
export const INTAKE_LINK_EXPIRED_MESSAGE = "This link has expired. Ask your Ignyte consultant for a new one.";

/** 24 random bytes in base64url: exactly 32 characters, 192 bits, from the crypto RNG (WI-003 E3). */
export function generateIntakeToken(random: (size: number) => Buffer = randomBytes): string {
  return random(24).toString("base64url");
}

/** SHA-256 of the token, the only form used for lookup. */
export function hashIntakeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** AES-256-GCM copy of the token so Copy can show the link again: iv.tag.ciphertext, base64url. */
export function encryptIntakeToken(token: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}

export function decryptIntakeToken(stored: string, key: Buffer): string {
  const [iv, tag, data] = stored.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !data) throw new Error("stored intake token is malformed");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function intakeLinkExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + INTAKE_LINK_DAYS * 24 * 60 * 60 * 1000);
}

/** Refused when now >= expires_at (E4). */
export function isIntakeLinkExpired(expiresAt: Date | null, now: Date): boolean {
  return !expiresAt || now.getTime() >= expiresAt.getTime();
}

export function intakeLinkUrl(appUrl: string, token: string): string {
  return new URL(`/intake/${token}`, appUrl).toString();
}

/** Everything a fresh link writes on the customer row; one update replaces all of it (Issue new link). */
export function newIntakeLinkColumns(key: Buffer, issuedBy: string | null, now: Date, token = generateIntakeToken()) {
  return {
    token,
    columns: {
      intakeTokenHash: hashIntakeToken(token),
      intakeTokenEncrypted: encryptIntakeToken(token, key),
      intakeTokenIssuedAt: now,
      intakeTokenExpiresAt: intakeLinkExpiry(now),
      intakeTokenIssuedBy: issuedBy,
    },
  };
}
