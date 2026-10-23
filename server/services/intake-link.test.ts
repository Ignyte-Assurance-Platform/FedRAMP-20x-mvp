import { randomBytes } from "node:crypto";
import * as v from "valibot";
import { describe, expect, it, vi } from "vitest";
import type { CustomerRow } from "~server/repositories";
import { CustomerInput, intakeLinkView } from "./customers";
import {
  decryptIntakeToken,
  encryptIntakeToken,
  generateIntakeToken,
  hashIntakeToken,
  intakeLinkExpiry,
  intakeLinkUrl,
  isIntakeLinkExpired,
  newIntakeLinkColumns,
} from "./intake-link";

const KEY = Buffer.alloc(32, 7);
const ISSUED = new Date("2026-10-01T12:00:00Z");

describe("intake link token (WI-003 E3, E4)", () => {
  it("2.7 two tokens differ and both are 32 characters of base64url from 24 random bytes", () => {
    const a = generateIntakeToken();
    const b = generateIntakeToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(b).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
  });

  it("2.7 draws its bytes from the crypto RNG", () => {
    const random = vi.fn((size: number) => randomBytes(size));
    generateIntakeToken(random);
    expect(random).toHaveBeenCalledWith(24);
  });

  it("2.1 stores only the hash and an encrypted copy, never the token itself", () => {
    const { token, columns } = newIntakeLinkColumns(KEY, "user-1", ISSUED);
    expect(columns.intakeTokenHash).toBe(hashIntakeToken(token));
    expect(columns.intakeTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(columns.intakeTokenEncrypted).not.toContain(token);
    expect(decryptIntakeToken(columns.intakeTokenEncrypted, KEY)).toBe(token);
    expect(Object.values(columns)).not.toContain(token);
  });

  it("an encrypted copy does not decrypt with another key", () => {
    const stored = encryptIntakeToken("x".repeat(32), KEY);
    expect(() => decryptIntakeToken(stored, Buffer.alloc(32, 8))).toThrow();
  });

  it("2.8 expires 30 days after issue: refused when now >= expires_at", () => {
    const expires = intakeLinkExpiry(ISSUED);
    expect(expires.toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(isIntakeLinkExpired(expires, new Date(expires.getTime() - 1))).toBe(false);
    expect(isIntakeLinkExpired(expires, expires)).toBe(true);
    expect(isIntakeLinkExpired(null, ISSUED)).toBe(true);
  });

  it("builds the link as https://<host>/intake/<token>", () => {
    expect(intakeLinkUrl("https://maaz.example.com", "a".repeat(32))).toBe(`https://maaz.example.com/intake/${"a".repeat(32)}`);
  });

  it("2.13 shows no link once it has expired", () => {
    const { token, columns } = newIntakeLinkColumns(KEY, "user-1", ISSUED);
    const row = { ...columns, status: "not_started" } as unknown as CustomerRow;
    const deps = { key: KEY, appUrl: "https://maaz.example.com" };
    expect(intakeLinkView(row, { ...deps, now: () => new Date("2026-10-30T00:00:00Z") }).url).toBe(`https://maaz.example.com/intake/${token}`);
    expect(intakeLinkView(row, { ...deps, now: () => new Date("2026-10-31T12:00:00Z") })).toMatchObject({ url: null, expired: true });
  });
});

describe("Screen C validation (WI-003)", () => {
  const valid = { name: "Example Cloud Co.", serviceName: "ERP", contactName: "Pat", contactEmail: "pat@example.com" };

  it("2.3 blocks Save when a required field is empty and names the field", () => {
    for (const field of ["name", "serviceName", "contactName", "contactEmail"] as const) {
      const result = v.safeParse(CustomerInput, { ...valid, [field]: "  " });
      expect(result.success).toBe(false);
      expect(result.issues?.map((i) => v.getDotPath(i))).toContain(field);
    }
  });

  it("checks the contact email format and leaves the description optional", () => {
    expect(v.safeParse(CustomerInput, { ...valid, contactEmail: "not-an-email" }).success).toBe(false);
    expect(v.safeParse(CustomerInput, valid).success).toBe(true);
  });
});

describe("a stored link under another key (WI-003)", () => {
  it("shows as expired instead of failing the page", () => {
    const { columns } = newIntakeLinkColumns(KEY, "user-1", ISSUED);
    const row = { ...columns, status: "not_started" } as unknown as CustomerRow;
    const view = intakeLinkView(row, { key: Buffer.alloc(32, 9), appUrl: "https://maaz.example.com", now: () => ISSUED });
    expect(view).toMatchObject({ url: null, expired: true });
  });
});
