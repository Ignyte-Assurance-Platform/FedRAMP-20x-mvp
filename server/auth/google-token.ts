export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** ok: Google still accepts the grant. revoked: invalid_grant (account suspended or deleted, consent revoked). unreachable: anything else. */
export type GoogleCheckResult = "ok" | "revoked" | "unreachable";

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  tokenUrl?: string;
}

/**
 * Refreshes the access token with the stored refresh token (WI-002 E3). Called against Google's
 * token endpoint directly, not through Better Auth, because the library reports every failure
 * the same way and only `invalid_grant` may end a session.
 */
export async function checkGoogleGrant(refreshToken: string, client: GoogleClient): Promise<GoogleCheckResult> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: client.clientId,
    client_secret: client.clientSecret,
  });
  let response: Response;
  try {
    response = await (client.fetch ?? fetch)(client.tokenUrl ?? GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return "unreachable";
  }
  if (response.ok) return "ok";
  if (response.status === 400) {
    const error = (await response.json().catch(() => ({}))) as { error?: string };
    if (error.error === "invalid_grant") return "revoked";
  }
  return "unreachable";
}
