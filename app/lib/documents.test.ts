import { describe, expect, it } from "vitest";
import json from "../../form-definitions/documents.v1.json";
import {
  ACCEPTED_EXTENSIONS,
  asksNextReport,
  documentContentType,
  documentFileRefusal,
  documentProblems,
  DOCUMENT_MAX_BYTES,
  isCertificationOld,
  itemsFor,
  signatureMatches,
  type CustomerDocument,
  type DocumentsDefinition,
} from "./documents";

/** Tab 3 rules (WI-006 §3, §5) against the real form-definitions/documents.v1.json. */

const definition = json as DocumentsDefinition;
const labels = (cert: Parameters<typeof itemsFor>[1]) => itemsFor(definition, cert).map((item) => item.label);
const EVERYONE = [
  "Authorization boundary or architecture diagram",
  "Security policies and procedures",
  "Incident response plan and last test",
  "Vulnerability scan summaries",
  "Crypto modules with CMVP certificate numbers",
  "Training materials or records",
  "Change logs or monitoring evidence",
  "Third-party and subprocessor list",
];
const MB = 1024 * 1024;

describe("documents.v1.json", () => {
  it("names exactly the kinds of spec §4, plus Other", () => {
    expect([...definition.items.map((item) => item.kind), definition.other.kind].sort()).toEqual(
      [
        "soc2_report",
        "bridge_letter",
        "engagement_docs",
        "supplemental_evidence",
        "rar",
        "sap",
        "rev5_package_sar",
        "boundary_diagram",
        "policies",
        "ir_plan_test",
        "vuln_scans",
        "crypto_cmvp",
        "training",
        "change_logs",
        "third_parties",
        "other",
      ].sort(),
    );
  });
});

describe("items per certification (WI-006 §3)", () => {
  it("before a certification is chosen, only the Everyone items", () => {
    expect(labels(null)).toEqual(EVERYONE);
  });

  it("2.1 SOC 2 Type II shows the SOC 2 items, the Everyone items and the next-report date field", () => {
    expect(labels("soc2_type2")).toEqual([
      "Complete SOC 2 Type II report",
      "Bridge or gap letter (if applicable)",
      "Audit engagement documentation",
      "Supplemental compliance evidence (if applicable)",
      ...EVERYONE,
    ]);
    expect(itemsFor(definition, "soc2_type2")[2]?.help).toBe(
      "An audit engagement letter, a certification from a successful audit, or a bridge letter if you are currently under audit",
    );
    expect(asksNextReport(definition, "soc2_type2")).toBe(true);
    expect(asksNextReport(definition, "fedramp_ready")).toBe(false);
  });

  it("2.2 FedRAMP Ready and GovRAMP show Readiness Assessment Report and Security Assessment Plan plus Everyone", () => {
    for (const cert of ["fedramp_ready", "govramp"] as const) {
      expect(labels(cert)).toEqual(["Readiness Assessment Report", "Security Assessment Plan", ...EVERYONE]);
    }
  });

  it("2.3 FedRAMP Rev 5 (authorized) shows Previous FedRAMP package and SAR plus Everyone", () => {
    expect(labels("fedramp_rev5")).toEqual(["Previous FedRAMP package and SAR", ...EVERYONE]);
  });
});

describe("12-month warning (2.4)", () => {
  it("warns only when the period end date is more than 12 months before today", () => {
    expect(isCertificationOld("2025-10-27", "2026-10-28")).toBe(true);
    expect(isCertificationOld("2025-10-28", "2026-10-28")).toBe(false);
    expect(isCertificationOld("2026-06-30", "2026-10-28")).toBe(false);
    expect(isCertificationOld(null, "2026-10-28")).toBe(false);
    expect(definition.messages.old).toBe("FedRAMP requires a certification from the past 12 months (FRC-CLA-ASF). You can continue; your consultant will follow up.");
  });
});

describe("accepted files (§5)", () => {
  it("2.9 refuses a 251 MB file, a .zip and an .exe before upload, each with its message", () => {
    expect(documentFileRefusal(definition, { name: "big.pdf", size: 251 * MB })).toBe("Files can be up to 250 MB each");
    expect(documentFileRefusal(definition, { name: "package.zip", size: MB })).toBe("Please upload the files inside the zip one by one");
    expect(documentFileRefusal(definition, { name: "setup.exe", size: MB })).toBe(
      "This file type is not accepted. Accepted: PDF, Word, Excel, PNG, JPG, SVG, Visio, CSV, JSON, XML",
    );
    expect(documentFileRefusal(definition, { name: "big.pdf", size: DOCUMENT_MAX_BYTES })).toBeNull();
  });

  it("2.10 accepts PNG, SVG, VSDX, CSV, JSON and XML (and every other listed type), whatever the case of the extension", () => {
    for (const name of ["a.png", "a.svg", "a.vsdx", "a.csv", "a.json", "a.xml", "a.PDF", "a.doc", "a.docx", "a.xls", "a.xlsx", "a.jpg", "a.jpeg", "a.vsd"]) {
      expect(documentFileRefusal(definition, { name, size: 10 }), name).toBeNull();
    }
    expect(documentContentType("Diagram.VSDX")).toBe("application/vnd.ms-visio.drawing.main+xml");
    expect(documentContentType("data.csv")).toBe("text/csv");
    expect(documentContentType("noextension")).toBeNull();
  });

  it("2.8 checks each type's signature on the first bytes; text types only refuse a NUL byte", () => {
    const bytes = (...b: number[]) => new Uint8Array(b);
    const text = (t: string) => new TextEncoder().encode(t);
    expect(signatureMatches("pdf", text("%PDF-1.7"))).toBe(true);
    expect(signatureMatches("pdf", text("<html>"))).toBe(false);
    expect(signatureMatches("ole2", bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0))).toBe(true);
    expect(signatureMatches("zip-container", text("PK\u0003\u0004rest"))).toBe(true);
    expect(signatureMatches("zip-container", text("%PDF-"))).toBe(false);
    expect(signatureMatches("png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(signatureMatches("jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(signatureMatches("text", text("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBe(true);
    expect(signatureMatches("text", bytes(0x7b, 0x00, 0x7d))).toBe(false);
    expect(ACCEPTED_EXTENSIONS.docx?.signature).toBe("zip-container");
    expect(ACCEPTED_EXTENSIONS.zip).toBeUndefined();
  });
});

describe("Submit problems (2.11)", () => {
  const doc = (overrides: Partial<CustomerDocument>): CustomerDocument => ({
    id: "11111111-1111-4111-8111-111111111111",
    displayName: "Plan.pdf",
    size: 10,
    kind: "ir_plan_test",
    kindNote: null,
    policyVersion: null,
    policyUpdatedOn: null,
    ...overrides,
  });

  it("names each file without What is this?, an Other without its note, and a policy without version or last-updated date", () => {
    expect(documentProblems([doc({})])).toEqual([]);
    expect(documentProblems([doc({ kind: null })])).toEqual([
      { path: "/documents/11111111-1111-4111-8111-111111111111", message: "“Plan.pdf”: choose what this file is (“What is this?”)." },
    ]);
    expect(documentProblems([doc({ kind: "other", kindNote: "  " })]).map((p) => p.message)).toEqual(["“Plan.pdf”: add a short note for “Other”."]);
    expect(documentProblems([doc({ kind: "other", kindNote: "Pen test" })])).toEqual([]);
    expect(documentProblems([doc({ displayName: "Policies.docx", kind: "policies" })]).map((p) => p.message)).toEqual([
      "“Policies.docx”: add the policy version.",
      "“Policies.docx”: add the date the policy was last updated.",
    ]);
    expect(documentProblems([doc({ kind: "policies", policyVersion: "3.1", policyUpdatedOn: "2026-09-01" })])).toEqual([]);
  });

  it("an empty tab blocks nothing", () => {
    expect(documentProblems([])).toEqual([]);
  });
});
