export interface AnswerRowView {
  path: string;
  question: string;
  value: string;
}

export interface AnswerSectionView {
  path: string;
  title: string;
  rows: AnswerRowView[];
}

/** The path the hosted logo takes in the file; problems about the logo link to this row. */
export const LOGO_PATH = "/serviceIdentification/logo";

/** The DOM id of the row that answers a JSON path; problems link to it so focus can move there. */
export function answerRowId(path: string): string {
  return `q${path.replace(/[^A-Za-z0-9]+/g, "-")}`;
}

/**
 * Rows are grid cells (`display: contents` on the wrapper keeps the dl grid), so the id and
 * the focus target go on the <dt>, a real box the browser can scroll to and focus.
 */
const focusTargetClass = "scroll-mt-24 rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring";

export interface AnswersReadOnlyProps {
  sections: AnswerSectionView[];
  /** Public address of the logo Ignyte hosts; null when none can be built. */
  logoUrl: string | null;
  /** Whether the customer uploaded a logo at all (it may have no public address yet). */
  logoUploaded: boolean;
}

function LogoRow({ logoUrl, logoUploaded }: Pick<AnswersReadOnlyProps, "logoUrl" | "logoUploaded">) {
  return (
    <div
      id={answerRowId(LOGO_PATH)}
      tabIndex={-1}
      className={`flex flex-wrap items-center gap-4 rounded-md border p-3 ${focusTargetClass}`}
      aria-labelledby={`${answerRowId(LOGO_PATH)}-title`}
    >
      <div className="flex h-16 w-40 shrink-0 items-center justify-center rounded border bg-white p-1">
        {logoUrl ? (
          <img src={logoUrl} alt="Company logo as hosted by Ignyte" className="max-h-14 max-w-36 object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">no logo</span>
        )}
      </div>
      <div className="grid min-w-0 gap-0.5 text-sm">
        <span id={`${answerRowId(LOGO_PATH)}-title`} className="text-muted-foreground">
          Company logo (hosted by Ignyte, goes into the file)
        </span>
        {logoUrl ? (
          <a href={logoUrl} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">
            {logoUrl}
          </a>
        ) : logoUploaded ? (
          <span>Uploaded, but the logo host is not configured (LOGO_PUBLIC_BASE_URL), so it has no public address yet.</span>
        ) : (
          <span className="italic text-muted-foreground">not uploaded yet</span>
        )}
      </div>
    </div>
  );
}

/** Tab 1 answers, read-only (WI-007 §3): staff cannot change them here. */
export function AnswersReadOnly({ sections, logoUrl, logoUploaded }: AnswersReadOnlyProps) {
  return (
    <div className="grid gap-6">
      <LogoRow logoUrl={logoUrl} logoUploaded={logoUploaded} />
      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">The customer has not answered the "Company &amp; service" tab yet.</p>
      ) : (
        sections.map((section) => (
          <section
            key={section.path}
            id={answerRowId(section.path)}
            tabIndex={-1}
            className={focusTargetClass}
            aria-labelledby={`${answerRowId(section.path)}-title`}
          >
            <h3 id={`${answerRowId(section.path)}-title`} className="mb-2 text-sm font-semibold">
              {section.title}
            </h3>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[minmax(12rem,1fr)_2fr]">
              {section.rows.map((row) => (
                <div key={row.path} className="contents">
                  <dt id={answerRowId(row.path)} tabIndex={-1} className={`text-muted-foreground ${focusTargetClass}`}>
                    {row.question}
                  </dt>
                  <dd className="break-words">{row.value || <span className="italic text-muted-foreground">not answered</span>}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))
      )}
    </div>
  );
}
