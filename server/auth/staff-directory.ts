import { GoogleAuth } from "google-auth-library";

/** member / not_member: the directory answered. unreachable: any other answer, a timeout or no token (fail closed). */
export type MembershipResult = "member" | "not_member" | "unreachable";

/** Who may use the app (WI-019): the members of the Google group STAFF_GROUP_EMAIL. */
export interface StaffDirectory {
  isMember(email: string): Promise<MembershipResult>;
}

export const DIRECTORY_SCOPE = "https://www.googleapis.com/auth/admin.directory.group.member.readonly";
const DIRECTORY_URL = "https://admin.googleapis.com/admin/directory/v1/groups";
const TIMEOUT_MS = 5000;

/** The local driver: members are LOCAL_STAFF_EMAILS (default the dev sign-in user). Never used in production. */
export function localStaffDirectory(emails: string[]): StaffDirectory {
  const members = new Set(emails.map((e) => e.trim().toLowerCase()));
  return { isMember: async (email) => (members.has(email.toLowerCase()) ? "member" : "not_member") };
}

export interface GoogleDirectoryOptions {
  groupEmail: string;
  /** An access token with DIRECTORY_SCOPE; by default the runtime service account's, from Application Default Credentials. */
  getAccessToken?: () => Promise<string | null | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (message: string) => void;
}

/**
 * The google driver (WI-019 E1): Directory API members.hasMember as the runtime service account,
 * which holds the Workspace role Groups Reader. Only a 200 is an answer; every other status
 * (an address unknown to the domain answers 400 "Missing required field: memberKey") is
 * unreachable. The HTTP status and Google's status and reason codes are logged; never the token,
 * and never Google's free-text message, which may echo the member's email.
 */
export function googleStaffDirectory(options: GoogleDirectoryOptions): StaffDirectory {
  const auth = options.getAccessToken ? undefined : new GoogleAuth({ scopes: [DIRECTORY_SCOPE] });
  const getAccessToken = options.getAccessToken ?? (() => auth!.getAccessToken());
  const log = options.log ?? ((message: string) => console.error(message));
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const group = options.groupEmail;

  async function ask(email: string, signal: AbortSignal): Promise<MembershipResult> {
    const token = await getAccessToken();
    if (!token) {
      log(`staff directory: no access token for group ${group}`);
      return "unreachable";
    }
    const url = `${DIRECTORY_URL}/${encodeURIComponent(group)}/hasMember/${encodeURIComponent(email.toLowerCase())}`;
    const response = await (options.fetch ?? fetch)(url, { headers: { authorization: `Bearer ${token}` }, signal });
    const body = (await response.json().catch(() => ({}))) as { isMember?: unknown; error?: { status?: string; errors?: { reason?: string }[] } };
    if (response.status === 200 && typeof body.isMember === "boolean") return body.isMember ? "member" : "not_member";
    const reason = [body.error?.status, body.error?.errors?.[0]?.reason].filter(Boolean).join(" ") || "no error code";
    log(`staff directory: group ${group} answered ${response.status}: ${reason}`);
    return "unreachable";
  }

  return {
    isMember: async (email) => {
      const signal = AbortSignal.timeout(timeoutMs);
      const timedOut = new Promise<"timeout">((resolve) => signal.addEventListener("abort", () => resolve("timeout"), { once: true }));
      try {
        // The race also bounds the token request, which takes no signal.
        const result = await Promise.race([ask(email, signal), timedOut]);
        if (result !== "timeout") return result;
        log(`staff directory: group ${group} did not answer within ${timeoutMs} ms`);
      } catch (error) {
        log(`staff directory: group ${group} unreachable: ${error instanceof Error ? error.message : String(error)}`);
      }
      return "unreachable";
    },
  };
}

export function createStaffDirectory(env: { STAFF_DIRECTORY: "local" | "google"; STAFF_GROUP_EMAIL?: string; localStaffEmails: string[] }): StaffDirectory {
  return env.STAFF_DIRECTORY === "google"
    ? googleStaffDirectory({ groupEmail: env.STAFF_GROUP_EMAIL! })
    : localStaffDirectory(env.localStaffEmails);
}
