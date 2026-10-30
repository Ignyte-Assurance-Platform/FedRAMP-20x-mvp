import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { documentDownloadHref, DocumentsSection, formatIsoDate, type DocumentsSectionData } from "./documents-section";

/** Screen D's tab 3 card (WI-006 §3) as markup: Form needs a router, so it renders inside a memory router. */

const customerId = "8a3c2f9e-1b2d-4c5e-9f00-112233445566";
const OLD = "FedRAMP requires a certification from the past 12 months (FRC-CLA-ASF). You can continue; your consultant will follow up.";

function render(data: DocumentsSectionData): string {
  const router = createMemoryRouter([{ path: "/", element: <DocumentsSection customerId={customerId} data={data} busy={false} /> }]);
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

const base: DocumentsSectionData = {
  certification: { label: "SOC 2 Type II", periodEnd: "2025-06-30", nextReport: "2026-12-31", old: true, oldMessage: OLD, changedAfterSubmitAt: null },
  checklist: [
    { kind: "soc2_report", label: "Complete SOC 2 Type II report", present: true },
    { kind: "policies", label: "Security policies and procedures", present: false },
  ],
  files: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      displayName: "Policies 2026",
      originalFilename: "policies-v2.pdf",
      size: 2048,
      kindLabel: "Security policies and procedures",
      kindNote: null,
      policyVersion: "3.1",
      policyUpdatedOn: "2026-09-01",
      addedAfterSubmit: true,
      uploadedAt: new Date("2026-10-28T15:00:00Z"),
      versions: [
        { id: "11111111-1111-4111-8111-111111111111", originalFilename: "policies-v1.pdf", size: 1024, uploadedAt: new Date("2026-10-20T15:00:00Z"), replacedOn: new Date("2026-10-28T15:00:00Z") },
      ],
    },
  ],
};

describe("Screen D documents (WI-006)", () => {
  it("2.4 shows the certification, its dates (the next report for SOC 2) and the same 12-month warning", () => {
    const html = render(base);
    expect(html).toContain("SOC 2 Type II");
    expect(html).toContain("Jun 30, 2025");
    expect(html).toContain("Dec 31, 2026");
    expect(html).toContain(OLD);
    expect(render({ ...base, certification: { ...base.certification, old: false } })).not.toContain("FRC-CLA-ASF");
  });

  it("2.17 the checklist shows a check for a received item and missing otherwise", () => {
    const html = render(base);
    expect(html).toMatch(/aria-label="received">✓<\/span>Complete SOC 2 Type II report/);
    expect(html).toMatch(/>missing<\/span>Security policies and procedures/);
  });

  it("2.13, 2.15 lists the file with its kind and policy fields, 'added after submission', and the earlier version as 'replaced on [date]', both downloadable", () => {
    const html = render(base);
    expect(html).toContain("Policies 2026");
    expect(html).toContain("added after submission");
    expect(html).toContain("version 3.1");
    expect(html).toContain("last updated Sep 1, 2026");
    expect(html).toContain("uploaded as policies-v2.pdf");
    expect(html).toContain("policies-v1.pdf · replaced on Oct 28, 2026");
    expect(html).toContain(`href="${documentDownloadHref(customerId, "22222222-2222-4222-8222-222222222222")}"`);
    expect(html).toContain(`href="${documentDownloadHref(customerId, "11111111-1111-4111-8111-111111111111")}"`);
    expect(html).toContain('aria-label="Remove Policies 2026"');
    expect(html).not.toContain("<img");
  });

  it("a file uploaded before Submit has no label; a date typed by the customer is shown as that day", () => {
    const html = render({ ...base, files: [{ ...base.files[0]!, addedAfterSubmit: false, versions: [] }] });
    expect(html).not.toContain("added after submission");
    expect(html).not.toContain("replaced on");
    expect(formatIsoDate("2026-06-30")).toBe("Jun 30, 2026");
  });

  it("2.16 a certification changed after Submit says 'changed after submission on [date]' in the 'replaced on' format; otherwise nothing", () => {
    const changed = render({ ...base, certification: { ...base.certification, changedAfterSubmitAt: "2026-10-29T15:00:00.000Z" } });
    expect(changed).toContain("changed after submission on Oct 29, 2026");
    expect(render(base)).not.toContain("changed after submission");
  });
});
