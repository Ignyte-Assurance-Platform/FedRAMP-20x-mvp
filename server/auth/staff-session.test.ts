import { describe, expect, it, vi } from "vitest";
import type { MembershipResult } from "./staff-directory";
import { evaluateStaffSession, type StaffSession, type StaffSessionDeps } from "./staff-session";

const NOW = new Date("2026-10-23T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function session(overrides: Partial<StaffSession> = {}): StaffSession {
  return { id: "s1", userId: "u1", expiresAt: new Date(NOW.getTime() + 60 * 60_000), lastGoogleCheckAt: minutesAgo(5), lastGroupCheckAt: minutesAgo(1), ...overrides };
}

/**
 * One in-memory session row; the claims are atomic like UPDATE … WHERE last_google_check_at < now - 15 min
 * and UPDATE … WHERE last_group_check_at < now - 5 min.
 */
function deps(lastCheck: Date, overrides: Partial<StaffSessionDeps> = {}, lastGroupCheck = minutesAgo(1)) {
  const row = { last: lastCheck, group: lastGroupCheck };
  const d = {
    now: NOW,
    claimGroupCheck: vi.fn(async (_id: string, now: Date) => {
      if (now.getTime() - row.group.getTime() < 5 * 60_000) return false;
      row.group = now;
      return true;
    }),
    releaseGroupCheck: vi.fn(async (_id: string, claimedAt: Date, previous: Date) => {
      if (row.group.getTime() === claimedAt.getTime()) row.group = previous;
    }),
    isMember: vi.fn(async (): Promise<MembershipResult> => "member"),
    deactivateUser: vi.fn(async () => {}),
    googleEnabled: true,
    devLoginEnabled: false,
    claimGoogleCheck: vi.fn(async (_id: string, now: Date) => {
      if (now.getTime() - row.last.getTime() < 15 * 60_000) return false;
      row.last = now;
      return true;
    }),
    releaseGoogleCheck: vi.fn(async (_id: string, claimedAt: Date, previous: Date) => {
      if (row.last.getTime() === claimedAt.getTime()) row.last = previous;
    }),
    findRefreshToken: vi.fn(async (): Promise<string | null> => "refresh-token"),
    checkGoogle: vi.fn(async () => "ok" as const),
    deleteSession: vi.fn(async () => {}),
    deleteUserSessions: vi.fn(async () => {}),
    ...overrides,
  };
  return { d, row };
}

const active = { id: "u1", email: "max@ignyteplatform.com", active: true };

describe("staff guard (WI-002 E1–E3)", () => {
  it("2.6 ends a session older than 8 hours, however active the user was", async () => {
    const { d } = deps(minutesAgo(5));
    expect(await evaluateStaffSession(session({ expiresAt: minutesAgo(1) }), active, d)).toEqual({ ok: false, reason: "expired" });
    expect(d.deleteSession).toHaveBeenCalledWith("s1");
  });

  it("2.7 refuses an inactive user with not_authorized and deletes all their sessions", async () => {
    const { d } = deps(minutesAgo(5));
    expect(await evaluateStaffSession(session(), { ...active, active: false }, d)).toEqual({ ok: false, reason: "not_authorized" });
    expect(d.deleteUserSessions).toHaveBeenCalledWith("u1");
    expect(d.checkGoogle).not.toHaveBeenCalled();
  });

  it("2.14 does not call Google when the last check is younger than 15 minutes", async () => {
    const { d } = deps(minutesAgo(14));
    expect(await evaluateStaffSession(session({ lastGoogleCheckAt: minutesAgo(14) }), active, d)).toEqual({ ok: true });
    expect(d.claimGoogleCheck).not.toHaveBeenCalled();
    expect(d.checkGoogle).not.toHaveBeenCalled();
  });

  it("2.8 ends the session when Google answers invalid_grant", async () => {
    const { d } = deps(minutesAgo(16), { checkGoogle: vi.fn(async () => "revoked" as const) });
    expect(await evaluateStaffSession(session({ lastGoogleCheckAt: minutesAgo(16) }), active, d)).toEqual({ ok: false, reason: "revoked" });
    expect(d.deleteSession).toHaveBeenCalledWith("s1");
  });

  it("2.8 keeps the session when Google is unreachable and retries on the next request", async () => {
    const { d, row } = deps(minutesAgo(20), { checkGoogle: vi.fn(async () => "unreachable" as const) });
    const s = session({ lastGoogleCheckAt: minutesAgo(20) });
    expect(await evaluateStaffSession(s, active, d)).toEqual({ ok: true });
    expect(row.last).toEqual(minutesAgo(20));
    expect(await evaluateStaffSession(s, active, d)).toEqual({ ok: true });
    expect(d.checkGoogle).toHaveBeenCalledTimes(2);
    expect(d.deleteSession).not.toHaveBeenCalled();
  });

  it("2.8 ends the session when Google is unreachable and the last successful check is older than 60 minutes", async () => {
    const { d } = deps(minutesAgo(61), { checkGoogle: vi.fn(async () => "unreachable" as const) });
    expect(await evaluateStaffSession(session({ lastGoogleCheckAt: minutesAgo(61) }), active, d)).toEqual({ ok: false, reason: "revoked" });
    expect(d.deleteSession).toHaveBeenCalledWith("s1");
  });

  it("2.9 calls Google once when several requests of one session arrive after 15 minutes", async () => {
    const { d } = deps(minutesAgo(16));
    const s = session({ lastGoogleCheckAt: minutesAgo(16) });
    const verdicts = await Promise.all([1, 2, 3, 4].map(() => evaluateStaffSession(s, active, d)));
    expect(verdicts.every((v) => v.ok)).toBe(true);
    expect(d.claimGoogleCheck).toHaveBeenCalledTimes(4);
    expect(d.checkGoogle).toHaveBeenCalledTimes(1);
  });

  it("skips the Google check while Google sign-in is not configured", async () => {
    const { d } = deps(minutesAgo(90), { googleEnabled: false });
    expect(await evaluateStaffSession(session({ lastGoogleCheckAt: minutesAgo(90) }), active, d)).toEqual({ ok: true });
    expect(d.claimGoogleCheck).not.toHaveBeenCalled();
  });

  it("ends a session with no Google refresh token, except for the dev sign-in", async () => {
    const strict = deps(minutesAgo(16), { findRefreshToken: vi.fn(async () => null) }).d;
    expect(await evaluateStaffSession(session({ lastGoogleCheckAt: minutesAgo(16) }), active, strict)).toEqual({
      ok: false,
      reason: "not_authorized",
    });
    const dev = deps(minutesAgo(16), { devLoginEnabled: true, findRefreshToken: vi.fn(async () => null) }).d;
    expect(await evaluateStaffSession(session({ lastGoogleCheckAt: minutesAgo(16) }), active, dev)).toEqual({ ok: true });
  });
});

describe("staff group re-check (WI-019 E2, E3)", () => {
  const due = (m: number) => session({ lastGroupCheckAt: minutesAgo(m) });

  it("2.6 ends every session of a user who left the group, sets them inactive and says not authorized", async () => {
    const { d } = deps(minutesAgo(5), { isMember: vi.fn(async () => "not_member" as const) }, minutesAgo(6));
    expect(await evaluateStaffSession(due(6), active, d)).toEqual({ ok: false, reason: "not_authorized" });
    expect(d.isMember).toHaveBeenCalledWith("max@ignyteplatform.com");
    expect(d.deactivateUser).toHaveBeenCalledWith("u1");
    expect(d.deleteUserSessions).toHaveBeenCalledWith("u1");
  });

  it("2.6 keeps a member's session and moves the last group check to now", async () => {
    const { d, row } = deps(minutesAgo(5), {}, minutesAgo(6));
    expect(await evaluateStaffSession(due(6), active, d)).toEqual({ ok: true });
    expect(row.group).toEqual(NOW);
    expect(d.deactivateUser).not.toHaveBeenCalled();
  });

  it("2.7 does not call the directory when the last group check is younger than 5 minutes", async () => {
    const { d } = deps(minutesAgo(5), {}, minutesAgo(4.9));
    expect(await evaluateStaffSession(due(4.9), active, d)).toEqual({ ok: true });
    expect(d.claimGroupCheck).not.toHaveBeenCalled();
    expect(d.isMember).not.toHaveBeenCalled();
  });

  it("2.8 calls the directory once when several requests of one session arrive with the check due", async () => {
    const { d } = deps(minutesAgo(5), {}, minutesAgo(6));
    const verdicts = await Promise.all([1, 2, 3, 4].map(() => evaluateStaffSession(due(6), active, d)));
    expect(verdicts.every((v) => v.ok)).toBe(true);
    expect(d.claimGroupCheck).toHaveBeenCalledTimes(4);
    expect(d.isMember).toHaveBeenCalledTimes(1);
  });

  it("2.9 keeps the session when the directory is unreachable and retries on the next request", async () => {
    const { d, row } = deps(minutesAgo(5), { isMember: vi.fn(async () => "unreachable" as const) }, minutesAgo(7));
    expect(await evaluateStaffSession(due(7), active, d)).toEqual({ ok: true });
    // The claim is given back, so the last successful check is unchanged and the next request asks again.
    expect(row.group).toEqual(minutesAgo(7));
    expect(await evaluateStaffSession(due(7), active, d)).toEqual({ ok: true });
    expect(d.isMember).toHaveBeenCalledTimes(2);
    expect(d.deleteSession).not.toHaveBeenCalled();
  });

  it("2.9 keeps the session up to 15 minutes after the last successful group check, then ends it", async () => {
    const unreachable = { isMember: vi.fn(async () => "unreachable" as const) };
    expect(await evaluateStaffSession(due(15), active, deps(minutesAgo(5), unreachable, minutesAgo(15)).d)).toEqual({ ok: true });
    const { d } = deps(minutesAgo(5), unreachable, minutesAgo(15.1));
    expect(await evaluateStaffSession(due(15.1), active, d)).toEqual({ ok: false, reason: "revoked" });
    expect(d.deleteSession).toHaveBeenCalledWith("s1");
    // The user stays active: only this session ends, and the next sign-in asks the directory again.
    expect(d.deactivateUser).not.toHaveBeenCalled();
  });

  it("runs the group check first when the Google check is due too, and stops there for a non-member", async () => {
    const order: string[] = [];
    const { d } = deps(
      minutesAgo(16),
      {
        isMember: vi.fn(async () => (order.push("group"), "not_member" as const)),
        checkGoogle: vi.fn(async () => (order.push("google"), "ok" as const)),
      },
      minutesAgo(6),
    );
    expect(await evaluateStaffSession(session({ lastGoogleCheckAt: minutesAgo(16), lastGroupCheckAt: minutesAgo(6) }), active, d)).toEqual({
      ok: false,
      reason: "not_authorized",
    });
    expect(order).toEqual(["group"]);

    const both = deps(minutesAgo(16), { isMember: vi.fn(async () => (order.push("group"), "member" as const)), checkGoogle: vi.fn(async () => (order.push("google"), "ok" as const)) }, minutesAgo(6)).d;
    order.length = 0;
    expect(await evaluateStaffSession(session({ lastGoogleCheckAt: minutesAgo(16), lastGroupCheckAt: minutesAgo(6) }), active, both)).toEqual({ ok: true });
    expect(order).toEqual(["group", "google"]);
  });

  it("re-checks the group while Google sign-in is not configured (the dev sign-in)", async () => {
    const { d } = deps(minutesAgo(90), { googleEnabled: false, isMember: vi.fn(async () => "not_member" as const) }, minutesAgo(6));
    expect(await evaluateStaffSession(due(6), active, d)).toEqual({ ok: false, reason: "not_authorized" });
  });
});
