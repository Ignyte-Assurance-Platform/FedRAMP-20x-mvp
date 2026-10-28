import { describe, expect, it } from "vitest";
import { INTAKE_BODY_MAX_BYTES, readJsonCapped } from "./intake.$token";

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/intake/t", { method: "POST", body, headers, duplex: "half" } as RequestInit);

function chunked(text: string, chunkSize = 64 * 1024): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, (offset += chunkSize)));
    },
  });
}

describe("readJsonCapped", () => {
  it("parses a body under the cap", async () => {
    expect(await readJsonCapped(post(JSON.stringify({ intent: "save", version: 0 })))).toEqual({ intent: "save", version: 0 });
  });

  it("returns null for a body that is not JSON", async () => {
    expect(await readJsonCapped(post("not json"))).toBeNull();
  });

  it("refuses a declared Content-Length over the cap without reading", async () => {
    expect(await readJsonCapped(post("{}", { "content-length": String(INTAKE_BODY_MAX_BYTES + 1) }))).toBe("too-large");
  });

  it("refuses a chunked body that grows past the cap", async () => {
    const big = JSON.stringify({ intent: "save", version: 0, answers: { x: "a".repeat(INTAKE_BODY_MAX_BYTES) } });
    expect(await readJsonCapped(post(chunked(big)))).toBe("too-large");
  });
});
