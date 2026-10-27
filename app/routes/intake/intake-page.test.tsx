import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildFormDefinition } from "~server/fedramp";
import { checkAnswers, packageIdFallback } from "~/lib/form-definition";
import { PACKAGE_ID_NOTE } from "./components/form-fields";
import { IntakeExpired } from "./components/intake-expired";
import { IntakeTab1, logoFileRefusal, type IntakeTab1View } from "./components/intake-tab1";

/** Markup checks of Screen E tab 1 (WI-004); typing, autosave timing and uploads need a browser and run in the smoke test or not at all. */

const definition = buildFormDefinition();

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
