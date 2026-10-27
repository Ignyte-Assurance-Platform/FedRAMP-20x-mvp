import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FormField } from "~/lib/form-definition";
import goldenAnswers from "./testdata/golden-answers.json";
import { buildFormDefinition, loadFormOverlay } from "./form-definition";
import { loadVendoredSchemas, SCHEMAS_DIR } from "./schemas";
import { buildPackageOverview } from "./mapping/package-overview";
import { createTab1Checker } from "./tab1-check";
import { createSchemaValidator } from "./validate";

const schemas = loadVendoredSchemas();
const definition = buildFormDefinition(schemas);

function find(p: string, fields: FormField[] = definition.fields): FormField | undefined {
  for (const field of fields) {
    if (field.path === p) return field;
    const inner = field.fields && find(p, field.fields);
    if (inner) return inner;
  }
  return undefined;
}

describe("tab 1 form definition, generated from the vendored schema (WI-004)", () => {
  it("2.2 marks the schema's required fields required", () => {
    for (const p of ["/serviceIdentification/providerName", "/serviceIdentification/serviceAcronym", "/serviceIdentification/website", "/serviceProperties/serviceType", "/contactInformation"]) {
      expect(find(p)?.required, p).toBe(true);
    }
    expect(find("/serviceIdentification/ueiNumber")?.required).toBe(false);
  });

  it("2.3 offers exactly the schema strings for enumerated fields", () => {
    const po = schemas.packageOverview as { properties: { serviceProperties: { properties: Record<string, { enum?: string[]; items?: { enum?: string[] } }> } } };
    const sp = po.properties.serviceProperties.properties;
    expect(find("/serviceProperties/deploymentModel")?.options).toEqual(sp.deploymentModel!.enum);
    expect(find("/serviceProperties/businessCategory")?.options).toEqual(sp.businessCategory!.items!.enum);
    expect(find("/serviceProperties/businessCategory")?.options).toContain("Artificial Intelligence (AI)");
    expect(find("/serviceProperties/deploymentModel")?.options).toContain("Government Community Cloud");
  });

  it("2.4 carries the schema's if/then: access instructions are required when authentication is required", () => {
    expect(find("/serviceProperties/trustCenter/accessRequestInstructions")?.requiredWhen).toEqual({ key: "authenticationRequired", equals: true });
  });

  it("2.5 records the schema version and commit read from the vendored files, no literals", () => {
    const manifest = JSON.parse(readFileSync(path.join(SCHEMAS_DIR, "manifest.json"), "utf8")) as { commit: string };
    expect(definition.schemaCommit).toBe(manifest.commit);
    expect(definition.schemaVersion).toBe((schemas.packageOverview as { $schemaVersion: string }).$schemaVersion);
    expect(definition.version).toBe(`company.v${loadFormOverlay().revision}+po-${definition.schemaVersion}`);
    const source = readFileSync(path.join(import.meta.dirname, "form-definition.ts"), "utf8");
    expect(source).not.toContain(definition.schemaVersion);
    expect(source).not.toContain(manifest.commit.slice(0, 7));
  });

  it("2.19 labels the third-party section with FedRAMP's words and its note", () => {
    const section = find("/thirdPartyInformationResources");
    expect(section?.label).toBe("Third-party information resources within the Minimum Assessment Scope");
    expect(section?.note).toBe("This is not limited to services that touch federal data.");
    expect(definition.labels["/thirdPartyInformationResources"]).toBe(section?.label);
  });

  it("2.26 shows Christina's 'Why we ask (client)' lines word for word, and none where there is none", () => {
    expect(find("/serviceIdentification/serviceName")?.why).toEqual([
      "FedRAMP lists your product and each service it covers using the names you use in your marketing, so agencies can see exactly what is and isn't covered.",
    ]);
    expect(find("/contactInformation")?.why).toHaveLength(2);
    expect(find("/serviceIdentification/website")?.why).toBeUndefined();
    const dash = buildFormDefinition(schemas, { ...loadFormOverlay(), why: { "/serviceIdentification/website": ["—"] } });
    expect(find("/serviceIdentification/website", dash.fields)?.why).toBeUndefined();
  });

  it("never asks the customer for the assessor; the logo is an upload; the package ID is optional", () => {
    expect(find("/assessor")).toBeUndefined();
    expect(find("/serviceIdentification/logo")).toMatchObject({ kind: "logo", required: true });
    expect(find("/serviceIdentification/fedRampPackageId")).toMatchObject({ required: false, help: "Only if FedRAMP already assigned you one" });
  });

  it("2.28 publishes a label for every question, with * for list items", () => {
    expect(definition.labels["/contactInformation/*/contactPhone"]).toBe("Phone Number");
    expect(definition.labels["/serviceIdentification/fedRampPackageId"]).toBe("FedRAMP package ID");
  });
});

describe("Submit check of tab 1 (WI-004 §5)", () => {
  const checker = createTab1Checker(schemas);
  const check = (answers: Record<string, unknown>, hasLogo = true) => checker.check(answers, { hasLogo, labels: definition.labels });
  const golden = goldenAnswers as Record<string, unknown>;
  const withServiceIdentification = (patch: Record<string, unknown>) => ({ ...golden, serviceIdentification: { ...(golden.serviceIdentification as object), ...patch } });

  it("2.9 the golden example submits with zero problems", () => {
    expect(check(golden)).toEqual([]);
  });

  it("2.13 blocks Submit without a logo and names the logo", () => {
    const problems = check(golden, false);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.path).toBe("/serviceIdentification/logo");
    expect(problems[0]?.message).toContain("Logo");
  });

  it("2.4 blocks Submit when the Trust Center needs authentication and has no access instructions", () => {
    const sp = golden.serviceProperties as Record<string, Record<string, unknown>>;
    const trustCenter = { ...sp.trustCenter! };
    delete trustCenter.accessRequestInstructions;
    const problems = check({ ...golden, serviceProperties: { ...sp, trustCenter } });
    expect(problems.map((p) => p.path)).toContain("/serviceProperties/trustCenter/accessRequestInstructions");
  });

  it("§5 a free-format phone does not block Submit; Screen D's full validation still reports it", () => {
    const contacts = (golden.contactInformation as Record<string, unknown>[]).map((c, i) => (i === 0 ? { ...c, contactPhone: "+44 20 7946 0958" } : c));
    const answers = { ...golden, contactInformation: contacts };
    expect(check(answers)).toEqual([]);
    const full = createSchemaValidator(schemas).validate(buildPackageOverview({ answers, logoUrl: "https://logo.example/l.png" }));
    expect(full.map((e) => `${e.keyword} ${e.instancePath}`)).toContain("pattern /contactInformation/0/contactPhone");
  });

  it("checks advisor entries the customer adds; only the assessor is left out", () => {
    const problems = check({ ...golden, advisors: [{ name: 42 }], assessor: { name: 42 } });
    expect(problems.map((p) => p.path)).toEqual(["/advisors/0/name"]);
    expect(check({ ...golden, advisors: [{ name: "Example Advisory LLC" }] })).toEqual([]);
  });

  it("2.16 blocks Submit without a Sales contact, on the Contacts section, from the schema rule and the tab 1 label", () => {
    const contacts = (golden.contactInformation as Array<Record<string, unknown>>).filter((c) => c.contactType !== "Sales");
    const problems = check({ ...golden, contactInformation: contacts });
    expect(problems).toEqual([expect.objectContaining({ path: "/contactInformation", message: 'Add at least 1 Contact Information with Contact Type "Sales"' })]);
  });

  it("2.15 an empty package ID does not block Submit", () => {
    expect(check(withServiceIdentification({ fedRampPackageId: "" }))).toEqual([]);
  });

  it("2.2 an empty required field blocks Submit, named with its tab 1 label", () => {
    const problems = check(withServiceIdentification({ website: "" }));
    expect(problems.map((p) => p.path)).toEqual(["/serviceIdentification/website"]);
  });
});
