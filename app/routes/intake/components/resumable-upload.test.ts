import { describe, expect, it } from "vitest";
import { storedBytes, uploadResumable, UploadFailedError } from "./resumable-upload";

/** The browser side of the resumable session (WI-006 2.5, 2.6) against a fake session that behaves like Cloud Storage's. */

function fakeSession(total: number, options: { dropOnCall?: number[]; refuse?: number } = {}) {
  let stored = 0;
  let calls = 0;
  const ranges: string[] = [];
  const answer = () => (stored === total ? new Response(null, { status: 200 }) : new Response(null, { status: 308, headers: stored ? { range: `bytes=0-${stored - 1}` } : {} }));
  const fetch = (async (_url: string, init: RequestInit) => {
    calls++;
    const range = new Headers(init.headers).get("content-range")!;
    ranges.push(range);
    if (options.refuse) return new Response("no", { status: options.refuse });
    const part = /^bytes (\d+)-(\d+)\/\d+$/.exec(range);
    if (options.dropOnCall?.includes(calls)) {
      // The connection drops halfway through this part: nothing of it is kept.
      throw new TypeError("network error");
    }
    if (part && Number(part[1]) === stored) stored = Number(part[2]) + 1;
    return answer();
  }) as unknown as typeof globalThis.fetch;
  return { fetch, ranges, stored: () => stored };
}

const noWait = async () => undefined;

describe("uploadResumable", () => {
  it("2.5 sends the file in parts with Content-Range until the session answers 200", async () => {
    const session = fakeSession(25);
    const progress: number[] = [];
    await uploadResumable({ url: "https://s", file: new Blob(["x".repeat(25)]), partBytes: 10, fetch: session.fetch, wait: noWait, onProgress: (n) => progress.push(n) });
    expect(session.ranges).toEqual(["bytes 0-9/25", "bytes 10-19/25", "bytes 20-24/25"]);
    expect(progress).toEqual([10, 20, 25]);
    expect(session.stored()).toBe(25);
  });

  it("2.6 after a drop halfway it asks for the stored range and continues from there, not from the start", async () => {
    const dropped = fakeSession(40, { dropOnCall: [3] });
    await uploadResumable({ url: "https://s", file: new Blob(["x".repeat(40)]), partBytes: 10, fetch: dropped.fetch, wait: noWait });
    expect(dropped.ranges).toEqual(["bytes 0-9/40", "bytes 10-19/40", "bytes 20-29/40", "bytes */40", "bytes 20-29/40", "bytes 30-39/40"]);
    expect(dropped.ranges.filter((r) => r === "bytes 0-9/40")).toHaveLength(1);
    expect(dropped.stored()).toBe(40);
  });

  it("gives up after too many drops in a row, and at once on a refusal", async () => {
    const always = fakeSession(20, { dropOnCall: Array.from({ length: 50 }, (_, i) => i + 1) });
    await expect(uploadResumable({ url: "https://s", file: new Blob(["x".repeat(20)]), partBytes: 10, fetch: always.fetch, wait: noWait, retries: 2 })).rejects.toThrow(UploadFailedError);

    const refused = fakeSession(20, { refuse: 403 });
    await expect(uploadResumable({ url: "https://s", file: new Blob(["x".repeat(20)]), partBytes: 10, fetch: refused.fetch, wait: noWait })).rejects.toThrow("refused (403)");
    expect(refused.ranges).toHaveLength(1);
  });

  it("reads the stored range of a 308", () => {
    expect(storedBytes(new Response(null, { status: 308, headers: { range: "bytes=0-9" } }))).toBe(10);
    expect(storedBytes(new Response(null, { status: 308 }))).toBe(0);
  });
});
