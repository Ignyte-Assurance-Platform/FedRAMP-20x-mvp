import { describe, expect, it } from "vitest";
import { devLoginRefusedMessage } from "./dev-login-plugin";

describe("dev sign-in refusal (WI-019)", () => {
  it("says the dev user is not in the staff directory and names LOCAL_STAFF_EMAILS only for the local driver", () => {
    expect(devLoginRefusedMessage("dev@ignyteplatform.com", "local")).toBe("Dev user dev@ignyteplatform.com is not in the staff directory (LOCAL_STAFF_EMAILS).");
    expect(devLoginRefusedMessage("dev@ignyteplatform.com", "google")).toBe("Dev user dev@ignyteplatform.com is not in the staff directory.");
  });
});
