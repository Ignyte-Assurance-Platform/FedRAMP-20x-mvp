import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswersReadOnly, answerRowId, LOGO_PATH } from "./answers-read-only";
import { ProblemList, problemOwner, problemSummary, targetFor } from "./problem-list";

/**
 * Structural checks on the Screen D components (WI-007 §10). focus() and scrollIntoView()
 * are no-ops on a `display: contents` element, so the id and tabIndex a problem link
 * targets must sit on a real box; a browser-level check is out of reach here (no browser
 * runner in the unit project), so the markup is asserted instead.
 */

const sections = [
  {
    path: "/serviceIdentification",
    title: "Service Identification",
    rows: [
      { path: "/serviceIdentification/providerName", question: "Provider Name", value: "Example Cloud Co." },
      { path: "/serviceIdentification/website", question: "Website", value: "" },
    ],
  },
];

describe("AnswersReadOnly", () => {
  it("puts the id and focus target on the <dt>, never on the display:contents wrapper", () => {
    const html = renderToStaticMarkup(<AnswersReadOnly sections={sections} logoUrl={null} logoUploaded={false} />);
    const id = answerRowId("/serviceIdentification/providerName");
    expect(html).toMatch(new RegExp(`<dt id="${id}" tabindex="-1"`));
    expect(html).not.toMatch(new RegExp(`<div id="${id}"`));
    expect(html).not.toMatch(/class="[^"]*contents[^"]*" id=/);
    expect(html).not.toMatch(/id="[^"]+" tabindex="-1" class="contents"/);
  });

  it("shows the hosted logo with its public address when there is one", () => {
    const url = "https://logos.example.com/customers/8a3c2f9e-1b2d-4c5e-9f00-112233445566/logo/logo.png";
    const html = renderToStaticMarkup(<AnswersReadOnly sections={sections} logoUrl={url} logoUploaded={true} />);
    expect(html).toContain(`<img src="${url}"`);
    expect(html).toContain(`id="${answerRowId(LOGO_PATH)}" tabindex="-1"`);
  });

  it("explains an uploaded logo without a public address, and a missing one", () => {
    expect(renderToStaticMarkup(<AnswersReadOnly sections={[]} logoUrl={null} logoUploaded={true} />)).toContain(
      "the logo host is not configured",
    );
    expect(renderToStaticMarkup(<AnswersReadOnly sections={[]} logoUrl={null} logoUploaded={false} />)).toContain("not uploaded yet");
  });
});

describe("ProblemList", () => {
  const known = new Set(["/serviceIdentification", "/serviceIdentification/providerName", "/contactInformation", LOGO_PATH]);

  it("uses the singular for one problem and names only the place that has it", () => {
    expect(problemSummary([{ path: "/assessor/name" }])).toBe("1 problem to fix: in the Ignyte-only details above. Then generate again.");
    expect(problemSummary([{ path: "/serviceIdentification/providerName" }])).toBe(
      "1 problem to fix: in the customer's intake (unlock the form if needed). Then generate again.",
    );
    expect(problemSummary([{ path: LOGO_PATH }])).toBe("1 problem to fix: with the logo Ignyte hosts. Then generate again.");
  });

  it("counts problems by who fixes them", () => {
    const summary = problemSummary([
      { path: "/serviceIdentification/providerName" },
      { path: "/contactInformation/1/contactPhone" },
      { path: "/assessor/assessorID" },
      { path: "/advisors/0/name" },
      { path: LOGO_PATH },
    ]);
    expect(summary).toBe(
      "5 problems to fix: 2 in the customer's intake (unlock the form if needed), 2 in the Ignyte-only details above, 1 with the logo Ignyte hosts. Then generate again.",
    );
    expect(problemOwner("/assessor")).toBe("screen-d");
    expect(problemOwner("/advisors")).toBe("screen-d");
    expect(problemOwner("/serviceProperties/trustCenter/url")).toBe("intake");
  });

  it("links assessor and advisor problems to their boxes, the logo to its row, and the rest to the nearest answer row", () => {
    expect(targetFor("/assessor/name", known)).toBe("assessorName");
    expect(targetFor("/assessor/assessorID", known)).toBe("assessorId");
    expect(targetFor("/assessor", known)).toBe("assessorName");
    expect(targetFor("/advisors/0/name", known)).toBe("advisorName");
    expect(targetFor(LOGO_PATH, known)).toBe(answerRowId(LOGO_PATH));
    expect(targetFor("/serviceIdentification/serviceName", known)).toBe(answerRowId("/serviceIdentification"));
    expect(targetFor("/nowhere/at/all", known)).toBeUndefined();
  });

  it("renders a link per problem that can be focused", () => {
    const html = renderToStaticMarkup(
      <ProblemList
        problems={[
          { path: "/assessor/name", question: "Assessor Name", message: "Assessor Name has not been confirmed on the FedRAMP Marketplace" },
          { path: "/nowhere", question: "Nowhere", message: "Nowhere is required" },
        ]}
        knownPaths={known}
      />,
    );
    expect(html).toContain('href="#assessorName"');
    expect(html).toContain("2 problems to fix");
    expect(html).not.toContain('href="#undefined"');
  });
});
