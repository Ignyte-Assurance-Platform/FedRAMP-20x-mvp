import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { MembershipResult } from "./staff-directory";

/** Answered with 403 and this code when the dev user is not in the staff directory; the route sends it to /login. */
export const DEV_LOGIN_REFUSED_CODE = "not_authorized";

/** The refusal's message; it names LOCAL_STAFF_EMAILS only when that list is the directory. */
export function devLoginRefusedMessage(email: string, staffDirectory: "local" | "google"): string {
  return `Dev user ${email} is not in the staff directory${staffDirectory === "local" ? " (LOCAL_STAFF_EMAILS)" : ""}.`;
}

/**
 * Dev-only sign-in (WI-010): signs in as one fixed, seeded staff user without Google.
 * The plugin is only added to Better Auth when env.devLoginEnabled is true
 * (NODE_ENV=development and DEV_LOGIN=1); otherwise the endpoint does not exist.
 * It asks the staff directory first (WI-019; locally LOCAL_STAFF_EMAILS) and creates the
 * session through the same hooks, so an inactive dev user is refused too.
 */
export function devLoginPlugin(options: { email: string; staffDirectory: "local" | "google"; isMember: (email: string) => Promise<MembershipResult> }): BetterAuthPlugin {
  return {
    id: "maaz-dev-login",
    endpoints: {
      devSignIn: createAuthEndpoint("/dev/sign-in", { method: "POST" }, async (ctx) => {
        if ((await options.isMember(options.email.toLowerCase())) !== "member") {
          throw new APIError("FORBIDDEN", { message: devLoginRefusedMessage(options.email, options.staffDirectory), code: DEV_LOGIN_REFUSED_CODE });
        }
        const found = await ctx.context.internalAdapter.findUserByEmail(options.email);
        if (!found) {
          throw new APIError("UNAUTHORIZED", {
            message: `Dev user ${options.email} is not in the database. Run npm run db:seed.`,
          });
        }
        const session = await ctx.context.internalAdapter.createSession(found.user.id);
        await setSessionCookie(ctx, { session, user: found.user });
        return ctx.json({ user: { id: found.user.id, email: found.user.email, name: found.user.name } });
      }),
    },
  };
}
