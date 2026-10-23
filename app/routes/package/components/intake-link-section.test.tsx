import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { CopyLink } from "~/components/copy-link";
import { IntakeLinkSection, type IntakeLinkSectionProps } from "./intake-link-section";
import { ProblemList } from "./problem-list";

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
  it("2.16 the problem list has no role=alert of its own, so none is nested in the result's status region", () => {
    const html = renderToStaticMarkup(
      <div role="status" aria-live="polite">
        <ProblemList problems={[{ path: "/serviceIdentification/website", question: "Website", message: "Website is required" }]} knownPaths={new Set()} />
      </div>,
    );
    expect(html).not.toContain('role="alert"');
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });
});
