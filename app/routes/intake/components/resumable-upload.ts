/**
 * The browser side of a resumable upload session (WI-006 §8.1), the protocol Cloud Storage speaks
 * and the local driver emulates: each part is a PUT with Content-Range; 308 means "keep going"
 * and its Range header says what is stored; 200 or 201 means the object is complete. After a drop
 * (network error, 5xx, 408, 429) it waits, asks the session for the stored range with a "*" range,
 * and continues from there, never from the start.
 */

/**
 * 308s in a row answering a part that do not move the offset before giving up (e.g. the browser
 * cannot read Range). A status query after a drop never counts: retries decide there.
 */
export const MAX_STALLS = 3;

/** Cloud Storage wants parts in multiples of 256 KiB (except the last). */
export const PART_BYTES = 8 * 1024 * 1024;

export interface ResumableUploadOptions {
  url: string;
  file: Blob;
  partBytes?: number;
  /** Consecutive failures tolerated before giving up. */
  retries?: number;
  fetch?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  onProgress?: (stored: number, total: number) => void;
}

export class UploadFailedError extends Error {}

const done = (res: Response | null) => res !== null && (res.status === 200 || res.status === 201);
const retryable = (res: Response | null) => res === null || res.status >= 500 || res.status === 408 || res.status === 429;

/** Bytes stored according to a 308: "bytes=0-N" means N + 1; no Range header means none. */
export function storedBytes(res: Response): number {
  const match = /^bytes=0-(\d+)$/.exec(res.headers.get("range") ?? "");
  return match ? Number(match[1]) + 1 : 0;
}

export async function uploadResumable(options: ResumableUploadOptions): Promise<void> {
  const { url, file } = options;
  const partBytes = options.partBytes ?? PART_BYTES;
  const retries = options.retries ?? 8;
  const send = options.fetch ?? fetch;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const total = file.size;
  const put = async (contentRange: string, body?: Blob): Promise<Response | null> => {
    try {
      return await send(url, { method: "PUT", headers: { "content-range": contentRange }, body });
    } catch {
      return null;
    }
  };

  let offset = 0;
  let failures = 0;
  let stalls = 0;
  const moveTo = (stored: number) => {
    if (stored > offset) stalls = 0;
    else if (++stalls >= MAX_STALLS) throw new UploadFailedError("The upload is not moving forward. Try again.");
    offset = stored;
    options.onProgress?.(offset, total);
  };
  for (;;) {
    const end = Math.min(offset + partBytes, total) - 1;
    const res = await put(`bytes ${offset}-${end}/${total}`, file.slice(offset, end + 1));
    if (done(res)) {
      options.onProgress?.(total, total);
      return;
    }
    if (res?.status === 308) {
      failures = 0;
      moveTo(storedBytes(res));
      continue;
    }
    if (!retryable(res)) throw new UploadFailedError(`The upload was refused (${res?.status}).`);
    if (++failures > retries) throw new UploadFailedError("The connection kept dropping. Try again.");
    await wait(Math.min(1000 * 2 ** (failures - 1), 30_000));
    // Where did the session stop? Continue from there.
    const status = await put(`bytes */${total}`);
    if (done(status)) {
      options.onProgress?.(total, total);
      return;
    }
    if (status?.status === 308) {
      offset = storedBytes(status);
      options.onProgress?.(offset, total);
    }
  }
}
