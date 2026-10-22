import { answerRowId } from "./answers-read-only";

export interface ProblemView {
  path: string;
  question: string;
  message: string;
}

/** The nearest row that exists on the page for a problem's path (a missing field has no row of its own). */
function targetFor(path: string, knownPaths: ReadonlySet<string>): string | undefined {
  const parts = path.split("/").filter(Boolean);
  for (let i = parts.length; i > 0; i--) {
    const candidate = `/${parts.slice(0, i).join("/")}`;
    if (knownPaths.has(candidate)) return answerRowId(candidate);
  }
  return undefined;
}

/**
 * Problems found by Generate JSON (WI-007 §3, §10): a list of links that move focus to the
 * question named, announced to screen readers.
 */
export function ProblemList({ problems, knownPaths }: { problems: ProblemView[]; knownPaths: ReadonlySet<string> }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <p className="text-sm font-medium text-destructive">
        {problems.length === 1 ? "1 problem to fix" : `${problems.length} problems to fix`}. Fix them in the intake, then generate again. The customer never sees this list.
      </p>
      <ul className="mt-2 grid gap-1 text-sm">
        {problems.map((problem) => {
          const target = targetFor(problem.path, knownPaths);
          return (
            <li key={`${problem.path}:${problem.message}`}>
              {target ? (
                <a
                  href={`#${target}`}
                  className="font-medium underline underline-offset-2"
                  onClick={(event) => {
                    const element = document.getElementById(target);
                    if (!element) return;
                    event.preventDefault();
                    element.scrollIntoView({ block: "center" });
                    element.focus();
                  }}
                >
                  {problem.question}
                </a>
              ) : (
                <span className="font-medium">{problem.question}</span>
              )}
              <span className="text-muted-foreground"> — {problem.message}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
