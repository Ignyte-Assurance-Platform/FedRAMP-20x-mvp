import { Ajv2020 } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { buildFormDefinition } from "./form-definition";
import golden from "./testdata/golden-answers.json";
import { checkAnswers, type FormField } from "~/lib/form-definition";

/** The browser-side check (m6): Valibot rules generated from the definition, agreeing with the server's ajv formats. */

const definition = buildFormDefinition();
const ajv = new Ajv2020({ strict: false });
addFormats(ajv, ["uri", "email", "date"]);

const field = (format: "email" | "uri" | "date"): FormField => ({ path: `/${format}`, key: "x", label: "X", kind: format === "uri" ? "url" : format, required: false, format });
const clientAccepts = (format: "email" | "uri" | "date", value: string) => checkAnswers([field(format)], { x: value }).length === 0;
const serverAccepts = (format: "email" | "uri" | "date", value: string) => ajv.validate({ type: "string", format }, value);

const SAMPLES = {
  email: ["security@example.com", "first.last+tag@sub.example.co", "no-at-sign.example.com", "two@@example.com", "spaces in@example.com", "a@b"],
  uri: ["https://example.com", "https://example.com/path?q=1#f", "http://localhost:3000", "example.com", "www.example.com/page", "not a url", "https://"],
  date: ["2026-10-27", "2024-02-29", "2026-02-30", "2026-13-01", "10/27/2026", "2026-1-5"],
} as const;

describe("browser-side check of tab 1, generated as Valibot (WI-004 §5)", () => {
  for (const format of ["email", "uri", "date"] as const) {
    it(`agrees with the server's ajv "${format}" format on every sample`, () => {
      const disagreements = SAMPLES[format].filter((s) => clientAccepts(format, s) !== serverAccepts(format, s));
      expect(disagreements).toEqual([]);
    });
  }

  it("passes the golden answers the server's Submit check accepts with zero problems", () => {
    expect(checkAnswers(definition.fields, golden as Record<string, unknown>, "", true)).toEqual([]);
  });

  it("the golden-style minimum passes and a missing required field is named with its label", () => {
    const problems = checkAnswers(definition.fields, { serviceIdentification: { providerName: "X" } }, "", true);
    expect(problems.map((p) => p.path)).toContain("/serviceIdentification/serviceAcronym");
    expect(problems.find((p) => p.path === "/serviceIdentification/serviceAcronym")?.message).toMatch(/is required$/);
  });

  it("refuses a value outside the schema's enum and skips blank list rows", () => {
    const problems = checkAnswers(definition.fields, { serviceProperties: { deploymentModel: "Moon Cloud" }, contactInformation: [{}, { contactEmail: "nope" }] }, "", true);
    const paths = problems.map((p) => p.path);
    expect(paths).toContain("/serviceProperties/deploymentModel");
    expect(paths).toContain("/contactInformation/1/contactEmail");
    expect(paths.some((p) => p.startsWith("/contactInformation/0/"))).toBe(false);
  });
});
