export class AllowlistError extends Error {
  override name = "AllowlistError";
}

export interface AllowlistInput {
  adminEmails: string[];
  nodeEnv: "development" | "test" | "production";
  devLoginEmail: string;
  domain: string;
}

/**
 * The emails the allowlist seed makes active (WI-002 E5). Fails on any email outside the
 * Ignyte domain and, in production, on an empty list (a bad deploy must not lock everyone
 * out). Outside production the dev sign-in user is added and exempt from the domain check.
 */
export function allowlistEmails(input: AllowlistInput): string[] {
  const suffix = `@${input.domain.toLowerCase()}`;
  const emails = [...new Set(input.adminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const outside = emails.filter((e) => !e.endsWith(suffix));
  if (outside.length) throw new AllowlistError(`ADMIN_EMAILS has emails outside ${suffix}: ${outside.join(", ")}`);
  if (input.nodeEnv === "production") {
    if (!emails.length) throw new AllowlistError("ADMIN_EMAILS is empty: refusing to deactivate every user in production");
    return emails;
  }
  const dev = input.devLoginEmail.toLowerCase();
  return emails.includes(dev) ? emails : [...emails, dev];
}
