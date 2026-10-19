import { createHmac, timingSafeEqual } from "node:crypto";

/** Short-lived, HMAC-signed grant for one operation on one object (local driver only). */
export interface LocalGrant {
  op: "put" | "get";
  path: string;
  /** Expiry, unix seconds. */
  exp: number;
  ct?: string;
  max?: number;
  fn?: string;
}

export function signGrant(grant: LocalGrant, secret: string): string {
  const body = Buffer.from(JSON.stringify(grant)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyGrant(token: string, secret: string, now = Date.now()): LocalGrant | null {
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const grant = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LocalGrant;
    return grant.exp * 1000 > now ? grant : null;
  } catch {
    return null;
  }
}
