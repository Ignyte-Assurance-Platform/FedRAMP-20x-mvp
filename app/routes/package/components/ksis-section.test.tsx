import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { KsisSection, type KsisSectionData } from "./ksis-section";

/** Screen D's tab 2 card (WI-005 2.6, 2.15, 2.16, 2.17): markup only; the data comes from getKsisScreen, covered by the smoke test. */

function render(data: KsisSectionData): string {
  const router = createMemoryRouter([{ path: "/", element: <KsisSection data={data} busy={false} /> }]);
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

const block = (key: string, title: string, statusLabel: string, extra: Partial<KsisSectionData["blocks"][number]> = {}): KsisSectionData["blocks"][number] => ({
  key,
  title,
  statement: `Statement of ${key}.`,
  statusLabel,
  questions: [{ id: "1", text: `Question of ${key}?`, answer: "", recommended: false }],
  needHelp: false,
  ...extra,
});

const data: KsisSectionData = {
  rulesVersion: "R-OLD",
  rulesNote: "Answered under FedRAMP rules R-OLD; current rules R-NEW.",
  counts: "1/7 answered, 1 needs help",
  followUps: [
    { key: "KSI-CMT-LMC", title: "KSI-CMT-LMC Logging Changes", statusLabel: "Not answered" },
    { key: "KSI-SVC-SIN", title: "KSI-SVC-SIN Securing Information", statusLabel: "Needs help" },
  ],
  blocks: [
    block("KSI-CED-RAT", "KSI-CED-RAT Reviewing All Training", "Answered", { questions: [{ id: "22", text: "Q22?", answer: "Yearly quiz", recommended: false }] }),
    block("KSI-IAM-APM", "KSI-IAM-APM Adopting Passwordless Methods", "Partly answered", { howOften: "" }),
    block("KSI-SVC-SIN", "KSI-SVC-SIN Securing Information", "Needs help", { needHelp: true, howOften: "Yearly" }),
    {
      key: "vulnerability_detection",
      title: "Vulnerability detection",
      statusLabel: "Answered",
      questions: [
        { id: "18", text: "Q18?", answer: "Scans", recommended: false },
        { id: "19", text: "Q19?", answer: "", recommended: true },
      ],
      needHelp: false,
    },
  ],
  review: { cmvpValidated: false, cmvpNote: "Not on the CMVP list", logContextNote: null, updatedAt: null },
  savedAt: null,
};

describe("Screen D, security indicators (WI-005)", () => {
  it("2.6, 2.15 lists the follow-ups before the blocks, each linking to its block", () => {
    const html = render(data);
    const start = html.indexOf('aria-label="Follow-ups"');
    const list = html.slice(start, html.indexOf("</ul>", start));
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(html.indexOf('aria-label="KSI-CED-RAT Reviewing All Training"'));
    expect(list).toContain('<a href="#ksi-d-KSI-SVC-SIN" class="underline">KSI-SVC-SIN Securing Information</a> · Needs help');
    expect(list).toContain("KSI-CMT-LMC Logging Changes</a> · Not answered");
    expect(list).not.toContain("Partly answered");
  });

  it("shows every answer read-only with its status, the counts, and Recommended on question 19", () => {
    const html = render(data);
    expect(html).toContain(">1/7 answered, 1 needs help</p>");
    expect(html).toContain("Yearly quiz");
    expect(html).toContain(">Partly answered</span>");
    expect(html).toContain("The customer asked for help with this one.");
    expect(html).toMatch(/Q19\?<span[^>]*>Recommended<\/span>/);
    // The only editable controls are Ignyte's two notes.
    expect(html.match(/<textarea/g)).toHaveLength(2);
  });

  it("2.17 renders the statements of the saved version with the note when it is not the current one", () => {
    const html = render(data);
    expect(html).toContain("Answered under FedRAMP rules R-OLD; current rules R-NEW.");
    expect(html).toContain(">FedRAMP rules R-OLD</p>");
    expect(render({ ...data, rulesNote: null })).not.toContain("Answered under FedRAMP rules");
  });

  it("2.16 the CMVP control and the log-context note are on KSI-SVC-SIN only, with Not checked / Yes / No", () => {
    const html = render(data);
    const sin = html.slice(html.indexOf('aria-label="KSI-SVC-SIN Securing Information"'), html.indexOf('aria-label="Vulnerability detection"'));
    expect(sin).toContain("CMVP validated?");
    expect(sin).toContain("Log retention and review (optional context)");
    expect(sin).toMatch(/<option value="">Not checked<\/option><option value="yes">Yes<\/option><option value="no" selected="">No<\/option>/);
    expect(sin).toContain("Not on the CMVP list");
    expect(sin.match(/maxLength="2000"/g)).toHaveLength(2);
    expect(html.split("CMVP validated?").length - 1).toBe(1);
  });
});
