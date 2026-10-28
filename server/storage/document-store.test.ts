import { describe, expect, it } from "vitest";
import { attachmentDisposition } from "./document-store";

describe("attachmentDisposition", () => {
  it("encodes every character outside RFC 5987 attr-char, including ' ( ) *", () => {
    expect(attachmentDisposition("Bob's plan (v2)*.pdf")).toBe("attachment; filename*=UTF-8''Bob%27s%20plan%20%28v2%29%2A.pdf");
    expect(attachmentDisposition("Plan v1.pdf")).toBe("attachment; filename*=UTF-8''Plan%20v1.pdf");
    expect(attachmentDisposition("évaluation.pdf")).toBe("attachment; filename*=UTF-8''%C3%A9valuation.pdf");
  });
});
