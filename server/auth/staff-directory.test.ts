import { describe, expect, it, vi } from "vitest";
import { googleStaffDirectory, localStaffDirectory } from "./staff-directory";

const GROUP = "ignytefedramp20x@ignyteplatform.com";
const TOKEN = "ya29.secret-access-token";

/** The google driver against a stubbed Directory API answering `status` with `body`. */
function directory(answer: (url: string) => Response | Promise<Response>, overrides: { getAccessToken?: () => Promise<string | null> } = {}) {
  const log = vi.fn();
  const fetch = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => answer(String(input)));
  const dir = googleStaffDirectory({ groupEmail: GROUP, getAccessToken: overrides.getAccessToken ?? (async () => TOKEN), fetch: fetch as typeof globalThis.fetch, timeoutMs: 50, log });
  return { dir, fetch, log };
}

describe("google staff directory (WI-019 E1)", () => {
  it("asks hasMember for the group with the service account's token and the lowercased, encoded email", async () => {
    const { dir, fetch } = directory(() => Response.json({ isMember: true }));
    expect(await dir.isMember("Max+Test@IgnytePlatform.com")).toBe("member");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://admin.googleapis.com/admin/directory/v1/groups/ignytefedramp20x%40ignyteplatform.com/hasMember/max%2Btest%40ignyteplatform.com");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("answers not_member for 200 with isMember false", async () => {
    const { dir, log } = directory(() => Response.json({ isMember: false }));
    expect(await dir.isMember("someone@ignyteplatform.com")).toBe("not_member");
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    [400, "INVALID_ARGUMENT", "required"],
    [403, "PERMISSION_DENIED", "forbidden"],
    [404, "NOT_FOUND", "notFound"],
    [429, "RESOURCE_EXHAUSTED", "rateLimitExceeded"],
    [500, "INTERNAL", "backendError"],
    [503, "UNAVAILABLE", "backendError"],
  ])("answers unreachable for %i and logs the status and Google's codes, never the token or the email", async (code, status, reason) => {
    const message = "Missing required field: memberKey someone@ignyteplatform.com";
    const { dir, log } = directory(() => Response.json({ error: { code, message, status, errors: [{ reason, message }] } }, { status: code }));
    expect(await dir.isMember("someone@ignyteplatform.com")).toBe("unreachable");
    expect(log).toHaveBeenCalledWith(`staff directory: group ${GROUP} answered ${code}: ${status} ${reason}`);
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
    expect(JSON.stringify(log.mock.calls)).not.toContain("someone@");
  });

  it("logs a non-200 without Google's error body as such", async () => {
    const { dir, log } = directory(() => new Response("Bad Gateway", { status: 502 }));
    expect(await dir.isMember("someone@ignyteplatform.com")).toBe("unreachable");
    expect(log).toHaveBeenCalledWith(`staff directory: group ${GROUP} answered 502: no error code`);
  });

  it("answers unreachable for a 200 without a boolean isMember", async () => {
    expect(await directory(() => new Response("<html>", { status: 200 })).dir.isMember("a@ignyteplatform.com")).toBe("unreachable");
  });

  it("answers unreachable when the API does not answer within the timeout", async () => {
    const { dir, log } = directory((url) => new Promise<Response>(() => void url));
    expect(await dir.isMember("a@ignyteplatform.com")).toBe("unreachable");
    expect(log).toHaveBeenCalledWith(`staff directory: group ${GROUP} did not answer within 50 ms`);
  });

  it("answers unreachable when the token request hangs, fails or returns nothing", async () => {
    const hangs = directory(() => Response.json({ isMember: true }), { getAccessToken: () => new Promise(() => {}) });
    expect(await hangs.dir.isMember("a@ignyteplatform.com")).toBe("unreachable");
    expect(hangs.fetch).not.toHaveBeenCalled();

    const fails = directory(() => Response.json({ isMember: true }), { getAccessToken: async () => Promise.reject(new Error("Could not load the default credentials")) });
    expect(await fails.dir.isMember("a@ignyteplatform.com")).toBe("unreachable");
    expect(fails.log).toHaveBeenCalledWith(`staff directory: group ${GROUP} unreachable: Could not load the default credentials`);

    const none = directory(() => Response.json({ isMember: true }), { getAccessToken: async () => null });
    expect(await none.dir.isMember("a@ignyteplatform.com")).toBe("unreachable");
  });

  it("answers unreachable when the network fails", async () => {
    const { dir } = directory(() => Promise.reject(new TypeError("fetch failed")));
    expect(await dir.isMember("a@ignyteplatform.com")).toBe("unreachable");
  });
});

describe("local staff directory (WI-019)", () => {
  it("answers member for the listed emails only, whatever their case", async () => {
    const dir = localStaffDirectory(["dev@ignyteplatform.com"]);
    expect(await dir.isMember("DEV@ignyteplatform.com")).toBe("member");
    expect(await dir.isMember("other@ignyteplatform.com")).toBe("not_member");
  });
});
