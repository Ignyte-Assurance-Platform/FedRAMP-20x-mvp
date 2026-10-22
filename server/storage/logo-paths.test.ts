import { describe, expect, it } from "vitest";
import { logoObjectPrefix, publicObjectUrl } from "./paths";

const CUSTOMER = "8a3c2f9e-1b2d-4c5e-9f00-112233445566";

describe("hosted logo paths (contract §1, WI-007 F-f)", () => {
  it("places logos under customers/<id>/logo/", () => {
    expect(logoObjectPrefix(CUSTOMER)).toBe(`customers/${CUSTOMER}/logo/`);
    expect(() => logoObjectPrefix("not-a-uuid")).toThrowError(/invalid customer id/);
  });

  it("builds the public URL from the base and the object path, with or without a trailing slash", () => {
    const objectPath = `customers/${CUSTOMER}/logo/0f1e2d3c.png`;
    expect(publicObjectUrl("https://storage.googleapis.com/maaz20x-logos/", objectPath)).toBe(
      `https://storage.googleapis.com/maaz20x-logos/${objectPath}`,
    );
    expect(publicObjectUrl("https://storage.googleapis.com/maaz20x-logos", objectPath)).toBe(
      `https://storage.googleapis.com/maaz20x-logos/${objectPath}`,
    );
  });

  it("refuses object paths outside customers/", () => {
    expect(() => publicObjectUrl("https://logos.example.test/", "../etc/passwd")).toThrowError(/invalid object path/);
  });
});
