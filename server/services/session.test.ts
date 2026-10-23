import { describe, expect, it } from "vitest";
import { NOT_AUTHORIZED_MESSAGE, SIGN_IN_UNFINISHED_MESSAGE, signInErrorMessage } from "./session";

describe("login messages (WI-002 error states)", () => {
  it("2.2, 2.3, 2.10 show one 'not authorized' message for every refused account, with no detail", () => {
    // not_authorized: hd, email_verified, inactive, no refresh token; signup_disabled: not in the allowlist.
    for (const code of ["not_authorized", "signup_disabled", "signup disabled", "account_not_linked"]) {
      expect(signInErrorMessage(code)).toBe(NOT_AUTHORIZED_MESSAGE);
    }
    expect(NOT_AUTHORIZED_MESSAGE).toBe("This account is not authorized for Maaz 20x");
  });

  it("shows 'did not finish' when the Google flow was cancelled or failed", () => {
    for (const code of ["access_denied", "invalid_code", "state_mismatch", "unable_to_get_user_info"]) {
      expect(signInErrorMessage(code)).toBe(SIGN_IN_UNFINISHED_MESSAGE);
    }
    expect(signInErrorMessage(null)).toBeNull();
  });
});
