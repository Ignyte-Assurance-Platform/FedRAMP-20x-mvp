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

/** The DOM id of the row that answers a JSON path; problems link to it so focus can move there. */
export function answerRowId(path: string): string {
  return `q${path.replace(/[^A-Za-z0-9]+/g, "-")}`;
}

/** Tab 1 answers, read-only (WI-007 §3): staff cannot change them here. */
export function AnswersReadOnly({ sections }: { sections: AnswerSectionView[] }) {
  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">The customer has not answered the "Company &amp; service" tab yet.</p>;
  }
  return (
    <div className="grid gap-6">
      {sections.map((section) => (
        <section key={section.path} id={answerRowId(section.path)} tabIndex={-1} aria-labelledby={`${answerRowId(section.path)}-title`}>
          <h3 id={`${answerRowId(section.path)}-title`} className="mb-2 text-sm font-semibold">
            {section.title}
          </h3>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[minmax(12rem,1fr)_2fr]">
            {section.rows.map((row) => (
              <div key={row.path} id={answerRowId(row.path)} tabIndex={-1} className="contents">
                <dt className="text-muted-foreground">{row.question}</dt>
                <dd className="break-words">{row.value || <span className="italic text-muted-foreground">not answered</span>}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
