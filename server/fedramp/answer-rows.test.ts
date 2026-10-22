import { describe, expect, it } from "vitest";
import { answerSections } from "./answer-rows";
import { SchemaNavigator } from "./messages";
import { loadVendoredSchemas } from "./schemas";
import goldenAnswers from "./testdata/golden-answers.json";

const nav = new SchemaNavigator(loadVendoredSchemas());

describe("answerSections (WI-007 §3 read-only view)", () => {
  const sections = answerSections(nav, goldenAnswers);

  it("lists the top-level sections in the schema's order with their titles", () => {
    expect(sections.map((s) => s.path)).toEqual(Object.keys(goldenAnswers).map((k) => `/${k}`));
    expect(sections.map((s) => s.path)).toEqual([...sections.map((s) => s.path)].sort((a, b) => schemaIndex(a) - schemaIndex(b)));
    for (const section of sections) expect(section.title).not.toBe("");
  });

  it("names questions by the schema title and keeps the path as the anchor", () => {
    const identification = sections.find((s) => s.path === "/serviceIdentification")!;
    const acronym = identification.rows.find((r) => r.path === "/serviceIdentification/serviceAcronym");
    expect(acronym).toEqual({ path: "/serviceIdentification/serviceAcronym", question: "Service Acronym", value: "ERP" });
  });

  it("numbers repeated items and writes booleans and lists in words", () => {
    const contacts = sections.find((s) => s.path === "/contactInformation")!;
    expect(contacts.rows[0]?.question).toMatch(/ 1 · /);
    const thirdParties = sections.find((s) => s.path === "/thirdPartyInformationResources")!;
    for (const row of thirdParties.rows) expect(row.question).toMatch(/^[A-Za-z].* 1 · /);
    expect(contacts.rows.some((r) => r.path === "/contactInformation/1/contactPhone")).toBe(true);
    const properties = sections.find((s) => s.path === "/serviceProperties")!;
    expect(properties.rows.find((r) => r.path === "/serviceProperties/trustCenter/authenticationRequired")?.value).toBe("Yes");
    expect(properties.rows.find((r) => r.path === "/serviceProperties/businessCategory")?.value).toBe(
      "Data Management, Artificial Intelligence (AI)",
    );
  });

  it("prefers a form label when one exists", () => {
    const labelled = answerSections(nav, goldenAnswers, { "/contactInformation/*/contactPhone": "Phone" });
    const phone = labelled.find((s) => s.path === "/contactInformation")!.rows.find((r) => r.path === "/contactInformation/0/contactPhone");
    expect(phone?.question).toMatch(/Phone$/);
  });

  it("shows nothing for an empty form", () => {
    expect(answerSections(nav, {})).toEqual([]);
  });
});

function schemaIndex(path: string): number {
  const properties = nav.fieldSchema("")?.properties;
  const keys = properties && typeof properties === "object" ? Object.keys(properties) : [];
  return keys.indexOf(path.slice(1));
}
