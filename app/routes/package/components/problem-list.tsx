import { answerRowId } from "./answers-read-only";

export interface ProblemView {
  path: string;
  question: string;
  message: string;
  /** The generator's raw cause; tells the "not confirmed" assessor problem apart from a missing name. */
  raw?: string;
}

/** Same value as the generator's ASSESSOR_NOT_CONFIRMED (browser code cannot import it; both tests pin the literal). */
export const ASSESSOR_NOT_CONFIRMED_RAW = "assessor not confirmed";

/** Who fixes a problem: the customer in the intake, Ignyte in the boxes on this page, or Ignyte's logo hosting. */
export type ProblemOwner = "intake" | "screen-d" | "logo";

/** Ids of the Ignyte-only boxes on Screen D, by the path of the problems they answer (longest prefix first). */
const SCREEN_D_BOXES: ReadonlyArray<readonly [prefix: string, id: string]> = [
  ["/assessor/assessorID", "assessorId"],
  ["/assessor", "assessorName"],
  ["/advisors", "advisorName"],
];

const LOGO_PATH = "/serviceIdentification/logo";

const underPrefix = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

export function problemOwner(path: string): ProblemOwner {
  if (underPrefix(path, LOGO_PATH)) return "logo";
  if (SCREEN_D_BOXES.some(([prefix]) => underPrefix(path, prefix))) return "screen-d";
  return "intake";
}

/** The element a problem links to: the "Assessor Confirmed" tick, an Ignyte-only box, else the nearest answer row on the page. */
export function targetFor(path: string, knownPaths: ReadonlySet<string>, raw?: string): string | undefined {
  // The tick fixes "not confirmed on the FedRAMP Marketplace", not the name box.
  if (raw === ASSESSOR_NOT_CONFIRMED_RAW) return "assessorConfirmed";
  const box = SCREEN_D_BOXES.find(([prefix]) => underPrefix(path, prefix));
  if (box) return box[1];
  const parts = path.split("/").filter(Boolean);
  for (let i = parts.length; i > 0; i--) {
    const candidate = `/${parts.slice(0, i).join("/")}`;
    if (knownPaths.has(candidate)) return answerRowId(candidate);
  }
  return undefined;
}

/**
 * "2 problems to fix: 1 in the customer's intake, 1 in the Ignyte-only details above."
 * Only the places that actually have a problem are named, so the consultant is never sent
 * to the intake for something fixed on this page or by Ignyte's logo hosting.
 */
export function problemSummary(problems: ReadonlyArray<Pick<ProblemView, "path">>): string {
  const counts = { intake: 0, "screen-d": 0, logo: 0 };
  for (const problem of problems) counts[problemOwner(problem.path)] += 1;
  const total = problems.length;
  const places = [
    counts.intake ? `${counts.intake} in the customer's intake (unlock the form if needed)` : "",
    counts["screen-d"] ? `${counts["screen-d"]} in the Ignyte-only details above` : "",
    counts.logo ? `${counts.logo} with the logo Ignyte hosts` : "",
  ].filter(Boolean);
  const head = total === 1 ? "1 problem to fix" : `${total} problems to fix`;
  const where = places.length === 1 && total === places.length ? places[0]!.replace(/^1 /, "") : places.join(", ");
  return `${head}: ${where}. Then generate again.`;
}

/**
 * Problems found by Generate JSON (WI-007 §3, §10): a list of links that move focus to the
 * question named. It is announced by the result block's one live region (role="status" around it on
 * Screen D); it has no role of its own, so no alert is nested in a status region (IGN-8 pr-9 nit 8).
 */
export function ProblemList({ problems, knownPaths }: { problems: ProblemView[]; knownPaths: ReadonlySet<string> }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <p className="text-sm font-medium text-destructive">
        {problemSummary(problems)} <span className="font-normal text-muted-foreground">The customer never sees this list.</span>
      </p>
      <ul className="mt-2 grid gap-1 text-sm">
        {problems.map((problem) => {
          const target = targetFor(problem.path, knownPaths, problem.raw);
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
