import { describe, expect, it } from "vitest";
import { crc32cBase64, crc32cUpdate } from "./crc32c";

describe("crc32c", () => {
  it("matches the Castagnoli check value and is the same in one pass or in parts", () => {
    const data = Buffer.from("123456789");
    expect(crc32cUpdate(0, data)).toBe(0xe3069283);
    expect(crc32cUpdate(crc32cUpdate(0, data.subarray(0, 4)), data.subarray(4))).toBe(0xe3069283);
  });

  it("is reported as base64 of the big-endian value, like Cloud Storage's crc32c metadata", () => {
    expect(crc32cBase64(0xe3069283)).toBe(Buffer.from([0xe3, 0x06, 0x92, 0x83]).toString("base64"));
    // Cloud Storage reports "AAAAAA==" for an empty object.
    expect(crc32cBase64(crc32cUpdate(0, new Uint8Array()))).toBe("AAAAAA==");
  });
});
