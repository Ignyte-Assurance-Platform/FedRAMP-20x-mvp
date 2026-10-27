import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIntakeSaver, type Conflict, type PostResult, type SaveState } from "./intake-saver";

/** Save, autosave and Submit ordering of Screen E tab 1 against a mocked fetch (review M2, m3, m4). */

interface Call {
  body: Record<string, unknown>;
  resolve: (result: PostResult) => void;
}

function harness(version = 1) {
  const calls: Call[] = [];
  const states: SaveState[] = [];
  const conflicts: Conflict[] = [];
  const saver = createIntakeSaver({
    post: (body) => new Promise((resolve) => calls.push({ body, resolve })),
    answers: { a: 1 },
    version,
    delayMs: 2000,
    onState: (s) => states.push(s),
    onConflict: (c) => conflicts.push(c),
  });
  const type = (next: Record<string, unknown>) => {
    saver.changed(next);
  };
  const ok = (v: number) => ({ status: 200, data: { kind: "saved", version: v, savedAt: "2026-10-27T10:00:00Z" } });
  return { saver, calls, states, conflicts, type, ok, last: () => states.at(-1) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("intake saver (WI-004 E2)", () => {
  it("M2 Submit waits for the autosave in flight and sends the version it returned: no self-conflict", async () => {
    const h = harness(1);
    h.type({ a: 2 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.body).toMatchObject({ intent: "save", version: 1 });

    const submitted = h.saver.submit();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toHaveLength(1); // Submit has not gone out while the save is in flight
    h.calls[0]!.resolve(h.ok(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]!.body).toMatchObject({ intent: "submit", version: 2, answers: { a: 2 } });
    h.calls[1]!.resolve({ status: 200, data: { kind: "submitted" } });
    expect((await submitted)?.status).toBe(200);
    expect(h.conflicts).toEqual([]);
  });

  it("M2 Submit cancels a pending autosave, and nothing is saved after a successful Submit", async () => {
    const h = harness(3);
    h.type({ a: 2 });
    const submitted = h.saver.submit();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls.map((c) => c.body.intent)).toEqual(["submit"]);
    h.calls[0]!.resolve({ status: 200, data: { kind: "submitted" } });
    await submitted;
    h.type({ a: 3 });
    await vi.advanceTimersByTimeAsync(10_000);
    await h.saver.save();
    expect(h.calls).toHaveLength(1);
  });

  it("M2 a late 409/423 from an autosave after Submit is ignored", async () => {
    const h = harness(1);
    h.type({ a: 2 });
    await vi.advanceTimersByTimeAsync(2000);
    const submitted = h.saver.submit();
    h.calls[0]!.resolve({ status: 423, data: { kind: "locked", message: "submitted" } });
    await submitted;
    expect(h.conflicts).toEqual([]);
    expect(h.calls).toHaveLength(1);
  });

  it("m3 a 413 (or any other refusal) shows the server's message, keeps the changes and does not loop", async () => {
    const h = harness(1);
    h.type({ a: "x".repeat(10) });
    await vi.advanceTimersByTimeAsync(2000);
    h.calls[0]!.resolve({ status: 413, data: { kind: "refused", message: "The form is too large to save." } });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.last()).toEqual({ kind: "failed", message: "The form is too large to save." });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.calls).toHaveLength(1);
    // The next change tries again.
    h.type({ a: "short" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.calls).toHaveLength(2);
  });

  it("m3 a network failure or 5xx is retried after the delay", async () => {
    const h = harness(1);
    h.type({ a: 2 });
    await vi.advanceTimersByTimeAsync(2000);
    h.calls[0]!.resolve(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.last()).toEqual({ kind: "failed" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.calls).toHaveLength(2);
  });

  it("m4 a change typed while a save is in flight is saved once the save returns", async () => {
    const h = harness(1);
    h.type({ a: 2 });
    await vi.advanceTimersByTimeAsync(2000);
    h.type({ a: 3 }); // typed during the request
    await vi.advanceTimersByTimeAsync(2000); // its timer fires while the first save is still in flight
    expect(h.calls).toHaveLength(1);
    h.calls[0]!.resolve(h.ok(2));
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]!.body).toMatchObject({ intent: "save", version: 2, answers: { a: 3 } });
  });

  it("a real conflict from another window pauses autosave until Keep mine or Take theirs", async () => {
    const h = harness(1);
    h.type({ a: 2 });
    await vi.advanceTimersByTimeAsync(2000);
    h.calls[0]!.resolve({ status: 409, data: { kind: "conflict", answers: { a: "theirs" }, version: 5 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.conflicts).toEqual([{ answers: { a: "theirs" }, version: 5 }]);
    h.type({ a: 4 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.calls).toHaveLength(1);
    void h.saver.save(5); // Keep mine
    expect(h.calls[1]!.body).toMatchObject({ version: 5, answers: { a: 4 } });
  });
});
