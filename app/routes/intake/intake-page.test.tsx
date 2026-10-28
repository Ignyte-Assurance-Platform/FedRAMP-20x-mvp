import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildFormDefinition } from "~server/fedramp";
import { checkAnswers, packageIdFallback } from "~/lib/form-definition";
import { PACKAGE_ID_NOTE } from "./components/form-fields";
import { IntakeExpired } from "./components/intake-expired";
import documentsJson from "../../../form-definitions/documents.v1.json";
import type { DocumentsDefinition } from "~/lib/documents";
import { IntakeTab1, logoFileRefusal, type IntakeTab1View } from "./components/intake-tab1";
import { IntakeTab3, type IntakeTab3View } from "./components/intake-tab3";

/** Markup checks of Screen E tab 1 (WI-004); typing, autosave timing and uploads need a browser and run in the smoke test or not at all. */

const definition = buildFormDefinition();
const documentsDefinition = documentsJson as DocumentsDefinition;

function documentsView(overrides: Partial<IntakeTab3View> = {}): IntakeTab3View {
  return {
    definition: documentsDefinition,
    certification: { type: null, period_end_date: null, next_report_expected: null },
    certificationVersion: 0,
    documents: [],
    submitted: false,
    today: "2026-10-28",
    ...overrides,
  };
}

function view(overrides: Partial<IntakeTab1View> = {}): IntakeTab1View {
  return {
    customer: { name: "Example Cloud Co.", serviceName: "Example Records Platform" },
    status: "in_progress",
    locked: false,
    definition,
    answers: { serviceIdentification: { providerName: "Example Cloud Co.", serviceAcronym: "ERP" } },
    version: 1,
    savedAt: null,
    logo: null,
    documents: documentsView(),
    ...overrides,
  };
}

const render = (v: IntakeTab1View) => renderToStaticMarkup(<IntakeTab1 view={v} token={"a".repeat(32)} />);

describe("Screen E tab 1 (WI-004)", () => {
  it("2.1 shows the customer's company and service name in the header, with Save and Submit", () => {
    const html = render(view());
    expect(html).toContain("<h1");
    expect(html).toContain("Example Cloud Co.</h1>");
    expect(html).toContain("Example Records Platform");
    expect(html).toContain(">Save<");
    expect(html).toContain(">Submit<");
  });

  it("2.2 marks required questions", () => {
    const html = render(view());
    expect(html).toMatch(/Provider Name<span class="text-destructive"><span aria-hidden="true"> \*<\/span><span class="sr-only"> \(required\)<\/span>/);
  });

  it("2.15, 2.25 shows the package ID fallback with its note while the box is empty, and nothing without an acronym", () => {
    const html = render(view());
    expect(html).toContain('placeholder="Example Cloud Co. ERP"');
    expect(html).toContain(PACKAGE_ID_NOTE);
    const typed = render(view({ answers: { serviceIdentification: { providerName: "Example Cloud Co.", serviceAcronym: "ERP", fedRampPackageId: "FR2026" } } }));
    expect(typed).not.toContain(PACKAGE_ID_NOTE);
    const noAcronym = render(view({ answers: { serviceIdentification: { providerName: "Example Cloud Co." } } }));
    expect(noAcronym).not.toContain(PACKAGE_ID_NOTE);
    expect(packageIdFallback({ serviceIdentification: { providerName: "New Name Inc.", serviceAcronym: "NN" } })).toBe("New Name Inc. NN");
  });

  it("2.19, 2.26 shows the third-party label and the why-we-ask lines", () => {
    const html = render(view());
    expect(html).toContain("Third-party information resources within the Minimum Assessment Scope");
    expect(html).toContain("Why we ask: FedRAMP lists your product and each service it covers");
  });

  it("never shows an assessor question; the logo is a file upload for PNG or JPEG", () => {
    const html = render(view());
    expect(html).not.toContain("Assessor");
    expect(html).toContain('accept="image/png,image/jpeg"');
  });

  it("2.7 after Submit the tab is read-only: fields disabled, no Save or Submit", () => {
    const html = render(view({ locked: true, status: "submitted" }));
    expect(html).toContain("Tabs 1 and 2 are now read-only");
    expect(html).not.toContain(">Submit<");
    expect(html).toMatch(/<input[^>]*id="q-serviceIdentification-providerName"[^>]*disabled=""/);
  });

  it("2.23 an expired link shows only the expired message", () => {
    const html = renderToStaticMarkup(<IntakeExpired message="This link has expired. Ask your Ignyte consultant for a new one." />);
    expect(html).toBe('<main class="flex min-h-screen items-center justify-center p-6"><p role="alert" class="max-w-md text-center text-lg">This link has expired. Ask your Ignyte consultant for a new one.</p></main>');
  });

  it("names checkbox and radio groups with aria-labelledby, never with a label pointing at the group", () => {
    const html = render(view());
    const groups = [...html.matchAll(/<div id="([^"]+)" tabindex="-1" role="(?:group|radiogroup)"([^>]*)>/g)];
    expect(groups.length).toBeGreaterThan(0);
    for (const [, id, attrs] of groups) {
      expect(attrs, id).toContain(`aria-labelledby="${id}-label"`);
      expect(html).toContain(`id="${id}-label"`);
      expect(html).not.toContain(`for="${id}"`);
    }
  });
});

describe("browser-side checks (WI-004 §5)", () => {
  it("2.2, 2.4 finds empty required fields and the Trust Center rule before Submit", () => {
    const problems = checkAnswers(definition.fields, { serviceProperties: { trustCenter: { authenticationRequired: true } } }, "", true);
    const paths = problems.map((p) => p.path);
    expect(paths).toContain("/serviceIdentification");
    expect(paths).toContain("/serviceProperties/trustCenter/accessRequestInstructions");
  });

  it("2.13 names the logo when none is uploaded", () => {
    const problems = checkAnswers(definition.fields, { serviceIdentification: { providerName: "X" } }, "", false);
    expect(problems).toContainEqual({ path: "/serviceIdentification/logo", message: "Logo is required" });
  });

  it("2.11 refuses SVG, WebP and files over 2 MB before upload, and narrow images once measured", () => {
    expect(logoFileRefusal({ type: "image/svg+xml", size: 100 })).toMatch(/not accepted/);
    expect(logoFileRefusal({ type: "image/webp", size: 100 })).toMatch(/not accepted/);
    expect(logoFileRefusal({ type: "image/png", size: 3 * 1024 * 1024 })).toMatch(/larger than 2 MB/);
    expect(logoFileRefusal({ type: "image/png", size: 500 * 1024 }, 255)).toMatch(/narrower than 256 px/);
    expect(logoFileRefusal({ type: "image/png", size: 500 * 1024 }, 300)).toBeNull();
  });
});

describe("Screen E tab 3, documents (WI-006)", () => {
  const doc = (overrides: Partial<IntakeTab3View["documents"][number]> = {}) => ({
    id: "11111111-1111-4111-8111-111111111111",
    displayName: "Boundary.svg",
    size: 2048,
    kind: null,
    kindNote: null,
    policyVersion: null,
    policyUpdatedOn: null,
    ...overrides,
  });
  const renderTab3 = (v: IntakeTab3View, submitted = v.submitted) =>
    renderToStaticMarkup(<IntakeTab3 view={v} documents={v.documents} onDocumentsChange={() => undefined} submitted={submitted} post={async () => null} />);
  const certified = (type: IntakeTab3View["certification"]["type"], period_end_date: string | null = null) =>
    documentsView({ certification: { type, period_end_date, next_report_expected: null } });

  it("tab 3 is a real tab next to tab 1, no longer 'coming soon', also after Submit", () => {
    for (const html of [render(view()), render(view({ locked: true, status: "submitted" }))]) {
      expect(html).toMatch(/<button[^>]*>3\. Documents<\/button>/);
      expect(html).not.toContain("3. Documents · coming soon");
    }
  });

  it("before a certification is chosen, only the Everyone items and no next-report date", () => {
    const html = renderTab3(documentsView());
    expect(html).toContain("Which certification do you hold?");
    expect(html).toContain("Authorization boundary or architecture diagram");
    expect(html).not.toContain("Complete SOC 2 Type II report");
    expect(html).not.toContain("Expected date of the next report");
  });

  it("2.1 SOC 2 Type II lists its items with the grey line, the Everyone items and the next-report date field", () => {
    const html = renderTab3(certified("soc2_type2"));
    for (const label of ["Complete SOC 2 Type II report", "Bridge or gap letter (if applicable)", "Audit engagement documentation", "Supplemental compliance evidence (if applicable)", "Third-party and subprocessor list"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("An audit engagement letter, a certification from a successful audit, or a bridge letter if you are currently under audit");
    expect(html).toMatch(/<label[^>]*for="next-report"[^>]*>Expected date of the next report<\/label>/);
  });

  it("2.2, 2.3 FedRAMP Ready and GovRAMP list RAR and SAP; FedRAMP Rev 5 lists the previous package and SAR", () => {
    for (const type of ["fedramp_ready", "govramp"] as const) {
      const html = renderTab3(certified(type));
      expect(html).toContain("Readiness Assessment Report");
      expect(html).toContain("Security Assessment Plan");
      expect(html).not.toContain("Expected date of the next report");
    }
    const rev5 = renderTab3(certified("fedramp_rev5"));
    expect(rev5).toContain("Previous FedRAMP package and SAR");
    expect(rev5).not.toContain("Readiness Assessment Report");
  });

  it("2.4 a period end more than 12 months ago shows the FRC-CLA-ASF warning; a recent one does not", () => {
    expect(renderTab3(certified("soc2_type2", "2025-06-30"))).toContain("FedRAMP requires a certification from the past 12 months (FRC-CLA-ASF). You can continue; your consultant will follow up.");
    expect(renderTab3(certified("soc2_type2", "2026-06-30"))).not.toContain("FRC-CLA-ASF");
  });

  it("2.11 each file has What is this? (the listed items plus Other) where Submit's problem link lands; policies ask version and date, Other a note", () => {
    const html = renderTab3(documentsView({ documents: [doc()] }));
    expect(html).toMatch(/<select id="q-documents-11111111-1111-4111-8111-111111111111"/);
    expect(html).toContain('<option value="other">Other</option>');
    const policy = renderTab3(documentsView({ documents: [doc({ kind: "policies" })] }));
    expect(policy).toContain(">Version</label>");
    expect(policy).toContain(">Last updated</label>");
    const other = renderTab3(documentsView({ documents: [doc({ kind: "other" })] }));
    expect(other).toMatch(/<input[^>]*maxLength="200"/);
  });

  it("2.14 every file has Rename and Replace; the x shows only before Submit", () => {
    const before = renderTab3(documentsView({ documents: [doc()] }), false);
    expect(before).toContain(">Rename<");
    expect(before).toContain(">Replace<");
    expect(before).toContain('aria-label="Remove Boundary.svg"');
    const after = renderTab3(documentsView({ documents: [doc()], submitted: true }), true);
    expect(after).toContain(">Rename<");
    expect(after).toContain(">Replace<");
    expect(after).not.toContain("Remove Boundary.svg");
  });

  it("never renders an uploaded file, an SVG included, as an image", () => {
    expect(renderTab3(documentsView({ documents: [doc()] }))).not.toContain("<img");
  });
});
