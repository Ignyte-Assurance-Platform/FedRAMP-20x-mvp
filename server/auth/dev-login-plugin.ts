import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

/**
 * Dev-only sign-in (WI-010): signs in as one fixed, seeded staff user without Google.
 * The plugin is only added to Better Auth when env.devLoginEnabled is true
 * (NODE_ENV=development and DEV_LOGIN=1); otherwise the endpoint does not exist.
 */
export function devLoginPlugin(options: { email: string }): BetterAuthPlugin {
  return {
    id: "maaz-dev-login",
    endpoints: {
      devSignIn: createAuthEndpoint("/dev/sign-in", { method: "POST" }, async (ctx) => {
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
