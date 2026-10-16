import { describe, expect, it } from "vitest";
import { assertObjectPath, intakeObjectPath, safeFilename } from "./paths";

const customerId = "8a3c2f9e-1b2d-4c5e-9f00-112233445566";
const documentId = "0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e";

describe("intakeObjectPath", () => {
  it("follows the storage contract layout", () => {
    expect(intakeObjectPath(customerId, documentId, "SSP Appendix A.pdf")).toBe(
      `customers/${customerId}/intake/${documentId}/SSP Appendix A.pdf`,
    );
  });

  it("rejects ids that are not UUIDs", () => {
    expect(() => intakeObjectPath("../x", documentId, "a.pdf")).toThrow();
    expect(() => intakeObjectPath(customerId, "1", "a.pdf")).toThrow();
  });
});

describe("safeFilename", () => {
  it.each([
    ["../../etc/passwd", "passwd"],
    ["C:\\Users\\me\\plan.docx", "plan.docx"],
    ["..hidden.pdf", "hidden.pdf"],
    ["a\u0000b.pdf", "ab.pdf"],
    ["what?.xlsx", "what_.xlsx"],
    ["", "file"],
    ["...", "file"],
  ])("%j becomes %j", (input, expected) => {
    expect(safeFilename(input)).toBe(expected);
  });

  it("keeps at most 200 characters, preserving the extension", () => {
    const name = safeFilename(`${"a".repeat(300)}.pdf`);
    expect(name).toHaveLength(200);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});

describe("assertObjectPath", () => {
  it.each(["customers/../secrets", "/customers/x", "other/x", "customers//x", "customers\\x"])("rejects %j", (p) => {
    expect(() => assertObjectPath(p)).toThrow();
  });
});
