import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import goldenAnswers from "./testdata/golden-answers.json";
import goldenDocument from "./testdata/golden-package-overview.json";
import {
  createPackageOverviewGenerator,
  MissingAcronymError,
  packageOverviewFileName,
  todayInNewYork,
  type GenerateInput,
} from "./package-overview";
import { loadVendoredSchemas, SchemaManifestError, SCHEMAS_DIR } from "./schemas";

const LOGO = goldenDocument.serviceIdentification.logo;
const generator = createPackageOverviewGenerator();

const golden = (overrides: Partial<GenerateInput> = {}): GenerateInput => ({
  answers: structuredClone(goldenAnswers),
  logoUrl: LOGO,
  assessorName: "Example Assessor LLC",
  assessorId: "000123",
  assessorConfirmedAt: new Date("2026-10-20T15:00:00Z"),
  advisorName: "Ignyte",
  logoCheck: { ok: true },
  today: "2026-10-21",
  ...overrides,
});

// Fault injection edits arbitrary paths of the JSON fixture, so its type is left open on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseAnswers = Record<string, any>;

/** Golden answers with one change applied at a path of the answers object. */
function withAnswer(mutate: (answers: LooseAnswers) => void): GenerateInput {
  const input = golden();
  mutate(input.answers as LooseAnswers);
  return input;
}

describe("golden example (WI-007 §9, decision E3)", () => {
  it("is valid and deep-equals the golden fixture", () => {
    const result = generator.generate(golden());
    expect(result.problems).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.document).toEqual(goldenDocument);
    expect(result.fileName).toBe("ERP-package-overview.json");
  });

  it("produces the same bytes twice, keys in schema order", () => {
    const a = generator.generate(golden()).json;
    const b = generator.generate(golden()).json;
    expect(a).toBe(b);
    expect(Object.keys(JSON.parse(a))).toEqual(Object.keys(goldenDocument));
  });

  it("records the versions read from the vendored files, not from code", () => {
    const result = generator.generate(golden());
    const schema = JSON.parse(
      readFileSync(path.join(SCHEMAS_DIR, "fedramp-certification-package-overview-schema-2026-06-24.json"), "utf8"),
    ) as { $schemaVersion: string };
    const manifest = JSON.parse(readFileSync(path.join(SCHEMAS_DIR, "manifest.json"), "utf8")) as { commit: string };
    expect(result.schemaVersion).toBe(schema.$schemaVersion);
    expect(result.schemaCommit).toBe(manifest.commit);
  });
});

describe("Christina's fault cases owned by Screen D (WI-007 §9 table)", () => {
  const problemAt = (input: GenerateInput, problemPath: string) =>
    generator.generate(input).problems.find((p) => p.path === problemPath);

  it("#1 'N/A' in an optional field with a format", () => {
    const input = withAnswer((a) => (a.serviceProperties.secureConfigurationGuidance.url = "N/A"));
    const problem = problemAt(input, "/serviceProperties/secureConfigurationGuidance/url");
    expect(problem?.question).toBe("Repository URL");
    expect(problem?.message).toMatch(/^Repository URL is not in the expected format\./);
  });

  it("#3 Trust Center needs sign-in but has no access instructions", () => {
    const input = withAnswer((a) => delete a.serviceProperties.trustCenter.accessRequestInstructions);
    const problem = problemAt(input, "/serviceProperties/trustCenter/accessRequestInstructions");
    expect(problem?.message).toBe("Access Request Instructions is required when Authentication Required is true");
  });

  it("#5 phone without an area code", () => {
    const input = withAnswer((a) => (a.contactInformation[1].contactPhone = "555-0199"));
    const problem = problemAt(input, "/contactInformation/1/contactPhone");
    expect(problem?.question).toBe("Phone Number");
    expect(problem?.message).toMatch(/^Phone Number is not in the expected format\. US phone number/);
  });

  it("#6 business category 'AI'", () => {
    const input = withAnswer((a) => (a.serviceProperties.businessCategory[1] = "AI"));
    const problem = problemAt(input, "/serviceProperties/businessCategory/1");
    expect(problem?.message).toMatch(/must be one of: .*Artificial Intelligence \(AI\)/);
  });

  it("#7 five-digit assessor ID", () => {
    const problem = problemAt(golden({ assessorId: "12345" }), "/assessor/assessorID");
    expect(problem?.question).toBe("Assessor's FedRAMP ID");
  });

  it.each(["(202) 555-0199", "(800) 555-0199 ext. 42", "+1 202.555.0123"])("accepts the phone %s (v0.2.0)", (phone) => {
    const input = withAnswer((a) => (a.contactInformation[1].contactPhone = phone));
    expect(problemAt(input, "/contactInformation/1/contactPhone")).toBeUndefined();
  });
});

describe("blank form", () => {
  it("is refused when the acronym itself is missing", () => {
    expect(() => generator.generate(golden({ answers: {} }))).toThrow(MissingAcronymError);
  });

  it("lists every missing required field by question name and is a draft", () => {
    const result = generator.generate(
      golden({ answers: { serviceIdentification: { serviceAcronym: "ERP" } }, logoUrl: null, assessorName: "", assessorId: "", advisorName: "" }),
    );
    expect(result.valid).toBe(false);
    expect(result.fileName).toBe("ERP-package-overview-DRAFT.json");
    const messages = result.problems.map((p) => p.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "Provider Name is required",
        "Service Name is required",
        "Logo is required",
        "Service Properties is required",
        "Contact Information is required",
      ]),
    );
    expect(result.problems.every((p) => p.question && !p.question.startsWith("/"))).toBe(true);
  });

  it("asks for a Sales contact by name of the rule", () => {
    const input = withAnswer((a) => (a.contactInformation = [a.contactInformation[0]]));
    const problem = generator.generate(input).problems.find((p) => p.path === "/contactInformation");
    expect(problem?.message).toBe('Add at least 1 Contact Information with Contact Type "Sales"');
  });
});

describe("question names (decision E2)", () => {
  it("uses the form label when there is one, the schema title otherwise", () => {
    const input = withAnswer((a) => (a.contactInformation[1].contactPhone = "555-0199"));
    input.labels = { "/contactInformation/*/contactPhone": "Phone" };
    const problem = generator.generate(input).problems.find((p) => p.path === "/contactInformation/1/contactPhone");
    expect(problem?.question).toBe("Phone");
    expect(problem?.message).toMatch(/^Phone is not in the expected format/);
  });

  it("falls back to a generic sentence for rules without a template", () => {
    const input = withAnswer((a) => (a.serviceProperties.serviceType = "SaaS"));
    const problem = generator.generate(input).problems.find((p) => p.path === "/serviceProperties/serviceType");
    expect(problem?.message).toMatch(/^Service Model does not meet FedRAMP's rule: /);
  });
});

describe("business checks (WI-007 §5 step 2)", () => {
  it("the next report date must be after today in New York", () => {
    const result = generator.generate(golden({ today: "2027-01-15" }));
    expect(result.valid).toBe(false);
    expect(result.problems.map((p) => p.path)).toContain("/serviceProperties/nextOngoingCertificationReportDate");
  });

  it("an unconfirmed assessor keeps the file a draft", () => {
    const result = generator.generate(golden({ assessorConfirmedAt: null }));
    expect(result.valid).toBe(false);
    expect(result.fileName).toBe("ERP-package-overview-DRAFT.json");
    expect(result.problems[0]?.message).toBe("Assessor Name has not been confirmed on the FedRAMP Marketplace");
  });

  it("a logo URL that does not answer with an image keeps the file a draft", () => {
    const result = generator.generate(golden({ logoCheck: { ok: false, reason: "answered text/html" } }));
    expect(result.problems.map((p) => p.message)).toEqual(["Logo does not open as an image (answered text/html)"]);
  });
});

describe("advisors (decision E1)", () => {
  it("adds Ignyte once even if the customer listed it", () => {
    const input = withAnswer((a) => (a.advisors = [{ name: "ignyte" }, { name: "Other Advisor" }]));
    expect(generator.generate(input).document.advisors).toEqual([{ name: "ignyte" }, { name: "Other Advisor" }]);
  });

  it("sends no advisors when the box is empty and the customer listed none", () => {
    expect(generator.generate(golden({ advisorName: "" })).document).not.toHaveProperty("advisors");
  });
});

describe("helpers", () => {
  it("names files from the acronym, safely", () => {
    expect(packageOverviewFileName("ERP", true)).toBe("ERP-package-overview.json");
    expect(packageOverviewFileName("A/B C", false)).toBe("A_B_C-package-overview-DRAFT.json");
  });

  it("computes today in America/New_York", () => {
    expect(todayInNewYork(new Date("2026-10-22T02:00:00Z"))).toBe("2026-10-21");
  });

  it("finds the vendored schemas from the repo root, so the server bundle under build/ reads the same files", () => {
    expect(SCHEMAS_DIR).toBe(path.resolve(import.meta.dirname, "schemas"));
    expect(SCHEMAS_DIR).toBe(path.join(process.cwd(), "server", "fedramp", "schemas"));
  });

  it("refuses a vendored schema that does not match the manifest", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "schemas-"));
    try {
      cpSync(SCHEMAS_DIR, dir, { recursive: true });
      const file = path.join(dir, "fedramp-certification-package-overview-schema-2026-06-24.json");
      writeFileSync(file, `${readFileSync(file, "utf8")} `);
      expect(() => loadVendoredSchemas(dir)).toThrow(SchemaManifestError);
      expect(loadVendoredSchemas(SCHEMAS_DIR).schemaVersion).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
