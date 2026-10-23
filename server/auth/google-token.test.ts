import { describe, expect, it, vi } from "vitest";
import { checkGoogleGrant, GOOGLE_TOKEN_URL } from "./google-token";

const client = (fetch: typeof globalThis.fetch) => ({ clientId: "id", clientSecret: "secret", fetch });

describe("Google grant check (WI-002 E3, stubbed token endpoint)", () => {
  it("posts the refresh token to Google's token endpoint and reads 200 as ok", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ access_token: "a" }), { status: 200 }));
    expect(await checkGoogleGrant("rt", client(fetch))).toBe("ok");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(GOOGLE_TOKEN_URL);
    expect(String(init?.body)).toContain("grant_type=refresh_token");
    expect(String(init?.body)).toContain("refresh_token=rt");
  });

  it("reads 400 invalid_grant as revoked", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    expect(await checkGoogleGrant("rt", client(fetch))).toBe("revoked");
  });

  it("reads a network error, a 5xx or another 400 as unreachable", async () => {
    const offline = vi.fn(async (): Promise<Response> => {
      throw new TypeError("fetch failed");
    });
    expect(await checkGoogleGrant("rt", client(offline))).toBe("unreachable");
    expect(await checkGoogleGrant("rt", client(vi.fn(async () => new Response("", { status: 503 }))))).toBe("unreachable");
    const badClient = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_client" }), { status: 400 }));
    expect(await checkGoogleGrant("rt", client(badClient))).toBe("unreachable");
  });
});
