import { describe, expect, it } from "vitest";
import type { LogoPublisher } from "~server/storage";
import { publishMissingLogos } from "./logos";

const path = (n: number) => `customers/1b0e8a4e-3a61-4d0a-9d2c-6c1b2b9f6f10/logo/5f0c6f2e-8e3b-4a57-9b0e-2b8c1d7a9e1${n}.png`;

function fakes(inStore: string[], failOn: string[] = []) {
  const published = new Set<string>();
  const publisher: LogoPublisher = {
    publish: async (p) => {
      if (failOn.includes(p)) throw new Error("copy failed");
      published.add(p);
    },
    isPublished: async (p) => published.has(p),
    unpublish: async (p) => void published.delete(p),
  };
  const store = { stat: async (p: string) => (inStore.includes(p) ? { size: 1, contentType: "image/png", sha256: null, md5: null, crc32c: null, updatedAt: new Date() } : null) };
  return { publisher, store, published };
}

describe("publishMissingLogos (2.9)", () => {
  const logos = [1, 2, 3].map((n) => ({ objectPath: path(n), contentType: "image/png" }));

  it("copies every recorded logo the logos bucket lacks; a second run copies nothing", async () => {
    const { publisher, store, published } = fakes([path(1), path(2)]);
    const deps = { listLogos: async () => logos, store, publisher };
    expect(await publishMissingLogos(deps)).toEqual({ recorded: 3, published: 2, missing: 1, failed: 0 });
    expect([...published]).toEqual([path(1), path(2)]);
    expect(await publishMissingLogos(deps)).toEqual({ recorded: 3, published: 0, missing: 1, failed: 0 });
  });

  it("keeps going when one copy fails and counts it", async () => {
    const { publisher, store } = fakes([path(1), path(2), path(3)], [path(2)]);
    expect(await publishMissingLogos({ listLogos: async () => logos, store, publisher })).toEqual({ recorded: 3, published: 2, missing: 0, failed: 1 });
  });
});
