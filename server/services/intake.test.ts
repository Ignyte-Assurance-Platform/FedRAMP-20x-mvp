import { describe, expect, it } from "vitest";
import { buildPackageOverview } from "~server/fedramp";
import { fedrampClassFor, logoRefusal, prefillFromCustomer, sniffLogo, withoutIgnyteOwned } from "./intake";
import { withFedrampClass } from "./package-overview";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);

describe("tab 1 service rules (WI-004)", () => {
  it("2.22 drops serviceIdentification.logo and assessor from what the browser sends", () => {
    const clean = withoutIgnyteOwned({
      serviceIdentification: { providerName: "Example Cloud Co.", logo: "https://evil.example/logo.png" },
      assessor: { name: "Me", assessorID: "000001" },
    });
    expect(clean).toEqual({ serviceIdentification: { providerName: "Example Cloud Co." } });
  });

  it("2.27 starts tab 1 with the provider name, service name and description typed on Screen C", () => {
    expect(prefillFromCustomer({ name: "Example Cloud Co.", serviceName: "Example Records Platform", serviceDescription: "Records." })).toEqual({
      serviceIdentification: { providerName: "Example Cloud Co.", serviceName: "Example Records Platform", serviceDescription: "Records." },
    });
    expect(prefillFromCustomer({ name: "Only Name Co.", serviceName: null, serviceDescription: null })).toEqual({ serviceIdentification: { providerName: "Only Name Co." } });
  });

  it("2.14 stores Class A for 20x and no class otherwise", () => {
    expect(fedrampClassFor({ serviceIdentification: { certificationType: "20x" } })).toBe("A");
    expect(fedrampClassFor({ serviceIdentification: { certificationType: "Rev5" } })).toBeNull();
    expect(fedrampClassFor({})).toBeNull();
  });

  it("2.14 Screen D shows Class A as read-only text next to the certification type", () => {
    const sections = [{ path: "/serviceIdentification", title: "Service Identification", rows: [{ path: "/serviceIdentification/certificationType", question: "Certification Type", value: "20x" }] }];
    expect(withFedrampClass(sections, "A")[0]?.rows[0]?.value).toBe("20x · Class A");
    expect(withFedrampClass(sections, null)).toBe(sections);
  });

  it("2.18 puts ueiNumber in the file when filled and leaves the key out when empty", () => {
    const filled = buildPackageOverview({ answers: { serviceIdentification: { ueiNumber: "ABCDEF123456" } } });
    expect((filled.serviceIdentification as Record<string, unknown>).ueiNumber).toBe("ABCDEF123456");
    const empty = buildPackageOverview({ answers: { serviceIdentification: { ueiNumber: "", providerName: "X" } } });
    expect(empty.serviceIdentification).not.toHaveProperty("ueiNumber");
  });
});

describe("logo checks (WI-004 §5)", () => {
  it("2.12 recognises PNG and JPEG by their signature, and nothing else", () => {
    expect(sniffLogo(PNG)).toBe("image/png");
    expect(sniffLogo(JPEG)).toBe("image/jpeg");
    expect(sniffLogo(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffLogo(new TextEncoder().encode("RIFF....WEBPVP8 "))).toBeNull();
  });

  it("2.11 refuses a 3 MB logo, an SVG, a WebP and a narrow image with the instructions", () => {
    const instructions = "Upload a PNG or JPEG logo, at least 256 px wide and up to 2 MB.";
    expect(logoRefusal({ contentType: "image/png", size: 3 * 1024 * 1024 })).toContain(instructions);
    expect(logoRefusal({ contentType: "image/svg+xml", size: 1000 })).toContain(instructions);
    expect(logoRefusal({ contentType: "image/webp", size: 1000 })).toContain(instructions);
    expect(logoRefusal({ contentType: "image/png", size: 1000, width: 200 })).toContain("narrower than 256 px");
  });

  it("2.10 accepts a 300 px, 500 KB PNG", () => {
    expect(logoRefusal({ contentType: "image/png", size: 500 * 1024, width: 300 })).toBeNull();
  });
});
