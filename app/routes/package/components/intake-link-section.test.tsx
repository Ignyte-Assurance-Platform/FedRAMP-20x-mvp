import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { CopyLink } from "~/components/copy-link";
import CustomerPackage from "../customer-package";
import { IntakeLinkSection, type IntakeLinkSectionProps } from "./intake-link-section";

/** Markup checks for WI-003 on Screen D; clipboard and confirm() need a browser and are not run here. */

function render(element: React.ReactElement): string {
  const router = createMemoryRouter([{ path: "/", element }]);
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

const base: IntakeLinkSectionProps = {
  status: "in_progress",
  statusLabel: "In progress",
  url: "https://maaz.example.com/intake/abcdefghijklmnopqrstuvwxyz012345",
  expired: false,
  expiresAt: new Date("2026-11-22T12:00:00Z"),
  busy: false,
};

type ScreenDProps = React.ComponentProps<typeof CustomerPackage>;

/** Screen D as the loader returns it: one invalid file, so the result block renders the problem list. */
const loaderData: ScreenDProps["loaderData"] = {
  user: { id: "u1", name: "Dev", email: "dev@ignyteplatform.com" },
  screen: {
    customer: { id: "8a3c2f9e-1b2d-4c5e-9f00-112233445566", name: "Example Cloud Co." },
    inputs: { assessorName: "", assessorId: "", advisorName: "", assessorConfirmedAt: null, assessorConfirmedBy: null },
    answers: [],
    packageIdFallback: null,
    logoUrl: null,
    logoUploaded: false,
    schemaVersion: "1.0.0",
    status: { regenerate: undefined, answersChanged: false, downloadLabel: "Download draft" },
    latest: {
      id: "f1",
      fileName: "ERP-package-overview-DRAFT.json",
      valid: false,
      generatedAt: new Date("2026-10-26T12:00:00Z"),
      schemaVersion: "1.0.0",
      schemaCommit: "abc1234",
      rulesVersion: null,
      problems: [{ path: "/serviceIdentification/website", question: "Website", message: "Website is required", raw: "must have required property" }],
    },
  },
  intakeLink: { status: "submitted", statusLabel: "Submitted", link: { url: base.url, expired: false, issuedAt: new Date("2026-10-23T12:00:00Z"), expiresAt: new Date("2026-11-22T12:00:00Z"), issuedBy: "Dev" }, unlockedAt: null, unlockedBy: null },
  documents: { certification: { label: null, periodEnd: null, nextReport: null, old: false, oldMessage: "" }, checklist: [], files: [] },
  ksis: {
    rulesVersion: "r1",
    rulesNote: null,
    counts: "0/7 answered, 0 needs help",
    followUps: [],
    blocks: [],
    review: { cmvpValidated: null, cmvpNote: null, logContextNote: null, updatedAt: null, updatedBy: null },
    savedAt: null,
  },
};

function renderScreenD(actionData?: ScreenDProps["actionData"]): string {
  return render(<CustomerPackage {...({ loaderData, actionData } as ScreenDProps)} />);
}

/** The markup of one card, found by its title. */
function card(html: string, title: string): string {
  const start = html.indexOf(`>${title}<`);
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf("<div data-slot=\"card\"", start);
  return html.slice(start, end === -1 ? undefined : end);
}

describe("Intake link section (WI-003)", () => {
  it("shows the link with Copy, its expiry and Issue new link; no Unlock unless Submitted", () => {
    const html = render(<IntakeLinkSection {...base} />);
    expect(html).toContain(`value="${base.url}"`);
    expect(html).toContain("Copy link");
    expect(html).toContain("Expires Nov 22, 2026");
    expect(html).toContain("Issue new link");
    expect(html).not.toContain("Unlock");
  });

  it("2.6 offers Unlock on a Submitted customer", () => {
    expect(render(<IntakeLinkSection {...base} status="submitted" statusLabel="Submitted" />)).toContain("Unlock");
  });

  it("2.13 says 'Link expired — issue a new link' and disables Copy when the link has expired", () => {
    const html = render(<IntakeLinkSection {...base} url={null} expired />);
    expect(html).toContain("Link expired — issue a new link");
    expect(html).toContain("Expired");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Copy link<\/button>/);
  });

  it("announces 'Copied' in a live region", () => {
    expect(renderToStaticMarkup(<CopyLink url={base.url} />)).toMatch(/role="status" aria-live="polite"/);
  });
});

describe("one live region on Screen D (IGN-8 pr-9 nit 8)", () => {
  it("2.16 the result block is one status region and the problem list nests no role=alert in it", () => {
    const result = card(renderScreenD(), "Package Overview JSON");
    expect(result).toContain("1 problem to fix");
    expect(result).not.toContain('role="alert"');
    expect(result.match(/role="status"/g)).toHaveLength(1);
    expect(result.match(/aria-live=/g)).toHaveLength(1);
  });
});

describe("issue-link and unlock errors on Screen D (pr-19 finding 2)", () => {
  it("shows the error in the Intake link section that triggered it, not in the Package Overview JSON card", () => {
    const html = renderScreenD({ error: null, linkError: "Only a submitted intake can be unlocked.", generated: null });
    expect(card(html, "Intake link")).toMatch(/<p role="alert"[^>]*>Only a submitted intake can be unlocked\.<\/p>/);
    expect(card(html, "Package Overview JSON")).not.toContain("Only a submitted intake can be unlocked.");
  });

  it("shows the outcome of Issue new link and Unlock in the same place", () => {
    const html = renderScreenD({ error: null, linkMessage: "Unlocked. The customer can edit the intake again.", generated: null });
    expect(card(html, "Intake link")).toMatch(/<p role="status"[^>]*>Unlocked\./);
  });

  it("keeps Generate JSON errors in the Package Overview JSON card", () => {
    const html = renderScreenD({ error: "Could not generate the file. Nothing was saved.", generated: null });
    expect(card(html, "Package Overview JSON")).toContain("Could not generate the file.");
    expect(card(html, "Intake link")).not.toContain("Could not generate the file.");
  });
});
