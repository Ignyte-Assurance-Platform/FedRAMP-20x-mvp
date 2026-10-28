/** CRC32C (Castagnoli), the checksum Cloud Storage keeps for every object; the local driver computes the same. */

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0x82f63b78 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32cUpdate(crc: number, bytes: Uint8Array): number {
  let c = ~crc >>> 0;
  for (const byte of bytes) c = TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

/** Base64 of the big-endian checksum, the form Cloud Storage reports in object metadata. */
export function crc32cBase64(crc: number): string {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(crc >>> 0);
  return out.toString("base64");
}
