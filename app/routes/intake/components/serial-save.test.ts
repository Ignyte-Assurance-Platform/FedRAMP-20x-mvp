import { describe, expect, it } from "vitest";
import { createSerialSave } from "./serial-save";

/** A slow fake request: each send waits until the test releases it. */
function slowSend<T>() {
  const sent: T[] = [];
  const releases: (() => void)[] = [];
  const send = (change: T) =>
    new Promise<void>((resolve) => {
      sent.push(change);
      releases.push(resolve);
    });
  const release = async () => {
    releases.shift()!();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { send, sent, release };
}

describe("createSerialSave", () => {
  it("sends one request at a time and only the latest change made meanwhile", async () => {
    const fake = slowSend<string>();
    const saver = createSerialSave(fake.send);
    void saver.save("0002-01-05");
    void saver.save("0020-01-05");
    void saver.save("0202-01-05");
    const last = saver.save("2025-01-05");
    expect(fake.sent).toEqual(["0002-01-05"]);
    await fake.release();
    expect(fake.sent).toEqual(["0002-01-05", "2025-01-05"]);
    await fake.release();
    await last;
    expect(saver.hasPending()).toBe(false);
  });

  it("#42 M1: a year typed digit by digit against a slow server with version checks gives no 409 and stores the last value", async () => {
    // The server of certification-save: 409 when the version is not the stored one.
    let stored = { value: "", version: 0 };
    const statuses: number[] = [];
    const slowPost = async (value: string, version: number) => {
      await new Promise((r) => setTimeout(r, 5));
      if (version !== stored.version) return statuses.push(409), { status: 409, version: stored.version };
      stored = { value, version: stored.version + 1 };
      return statuses.push(200), { status: 200, version: stored.version };
    };
    let version = 0;
    const saver = createSerialSave<string>(async (value) => {
      version = (await slowPost(value, version)).version;
    });
    // Chrome fires one change per digit of the year.
    const all = ["0002-01-05", "0020-01-05", "0202-01-05", "2025-01-05"].map((d) => saver.save(d));
    await Promise.all(all);
    expect(statuses).not.toContain(409);
    expect(stored.value).toBe("2025-01-05");
  });

  it("merges waiting changes when asked", async () => {
    const fake = slowSend<Record<string, string>>();
    const saver = createSerialSave(fake.send, (a, b) => ({ ...a, ...b }));
    void saver.save({ kind: "policies" });
    void saver.save({ policyVersion: "3" });
    void saver.save({ policyUpdatedOn: "2026-01-02" });
    await fake.release();
    expect(fake.sent).toEqual([
      { kind: "policies" },
      { policyVersion: "3", policyUpdatedOn: "2026-01-02" },
    ]);
  });

  it("a send that throws does not stop later saves", async () => {
    const sent: number[] = [];
    const saver = createSerialSave<number>(async (n) => {
      sent.push(n);
      if (n === 1) throw new Error("boom");
    });
    await expect(saver.save(1)).rejects.toThrow("boom");
    await saver.save(2);
    expect(sent).toEqual([1, 2]);
  });

  it("discard drops the waiting change", async () => {
    const fake = slowSend<number>();
    const saver = createSerialSave(fake.send);
    void saver.save(1);
    void saver.save(2);
    saver.discard();
    await fake.release();
    expect(fake.sent).toEqual([1]);
  });
});
