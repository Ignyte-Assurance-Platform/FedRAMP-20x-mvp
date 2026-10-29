import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  blockStatus,
  countsText,
  ksiCounts,
  STATUS_LABELS,
  type BlockStatus,
  type KsiBlockAnswers,
  type KsisAnswers,
  type KsisDefinition,
  type ReadinessAnswers,
} from "~/lib/ksis";
import type { Conflict } from "./intake-saver";

/**
 * Screen E tab 2 (WI-005): seven collapsible Class A KSI blocks in playbook order, each with the
 * KSI code and name, FedRAMP's statement word for word with the rules version under it, the
 * question(s), the "why we ask" line, the optional "How often?" line where the form definition
 * has one, and the "need help" checkbox; then the Vulnerability detection block. Plain
 * textareas (E7). Saved like tab 1, by the saver tab 1 owns; read-only after Submit.
 */

export interface IntakeTab2View {
  definition: KsisDefinition;
  rulesVersion: string;
  statements: Record<string, { name: string; statement: string }>;
  answers: KsisAnswers;
  version: number;
  savedAt: Date | string | null;
}

export const KSIS_CONFLICT_MESSAGE = "These answers were changed in another window.";

const STATUS_CLASS: Record<BlockStatus, string> = {
  answered: "bg-green-600/15 text-green-800",
  partly: "bg-amber-500/15 text-amber-900",
  needs_help: "bg-blue-600/15 text-blue-900",
  not_answered: "bg-muted text-muted-foreground",
};

const textareaClass = "min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs disabled:opacity-70";
const inputClass = "h-9 w-full rounded-md border bg-background px-3 text-sm shadow-xs disabled:opacity-70";

/** DOM id of a tab 2 control, e.g. ksi-KSI-IAM-APM-q-14b. */
export const ksiDomId = (block: string, part: string) => `ksi-${block}-${part}`;

function StatusLabel({ status }: { status: BlockStatus }) {
  return <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function IntakeTab2({
  view,
  answers,
  onChange,
  locked,
  saveText,
  saving,
  onSave,
  conflict,
  onKeepMine,
  onTakeTheirs,
}: {
  view: IntakeTab2View;
  answers: KsisAnswers;
  onChange: (next: KsisAnswers) => void;
  locked: boolean;
  saveText: string;
  saving: boolean;
  onSave: () => void;
  conflict: Conflict | null;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
}) {
  const { definition } = view;
  const limits = definition.limits;
  const counts = ksiCounts(definition, answers);
  const versionLine = definition.labels.rulesVersion.replace("{version}", view.rulesVersion);

  const setKsi = (code: string, patch: Partial<KsiBlockAnswers>) =>
    onChange({ ...answers, ksi: { ...answers.ksi, [code]: { ...answers.ksi[code]!, ...patch } } });
  const setReadiness = (patch: Partial<ReadinessAnswers>) =>
    onChange({ ...answers, readiness: { vulnerability_detection: { ...answers.readiness.vulnerability_detection, ...patch } } });

  const needHelp = (id: string, checked: boolean, set: (value: boolean) => void) => (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" className="size-4 accent-primary" checked={checked} disabled={locked} onChange={(e) => set(e.target.checked)} />
      {definition.labels.needHelp}
    </label>
  );

  return (
    <div className="grid gap-4">
      <p role="status" className="text-sm font-medium" data-ksi-counts>
        {countsText(counts)}
      </p>

      {conflict && (
        <div role="alert" className="grid gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium">{KSIS_CONFLICT_MESSAGE}</p>
          <p>Keep your answers on this page, or load the answers saved from the other window.</p>
          <div className="flex gap-3">
            <Button type="button" onClick={onKeepMine}>
              Keep mine
            </Button>
            <Button type="button" variant="outline" onClick={onTakeTheirs}>
              Take theirs
            </Button>
          </div>
        </div>
      )}

      {definition.ksis.map((block) => {
        const saved = answers.ksi[block.code]!;
        const shown = view.statements[block.code]!;
        const status = blockStatus(block.questions, saved);
        return (
          <details key={block.code} className="group rounded-md border" data-ksi={block.code}>
            <summary className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <span className="font-mono text-xs text-muted-foreground">{block.code}</span>
              <span className="flex-1 font-semibold">{shown.name}</span>
              <StatusLabel status={status} />
            </summary>
            <div className="grid gap-4 border-t px-4 py-4">
              <div>
                <blockquote className="border-l-2 pl-3 text-sm">{shown.statement}</blockquote>
                <p className="mt-1 pl-3 text-xs text-muted-foreground">{versionLine}</p>
              </div>
              {block.questions.map((q) => (
                <div key={q.id} className="grid gap-1.5">
                  <Label htmlFor={ksiDomId(block.code, `q-${q.id}`)}>{q.text}</Label>
                  <textarea
                    id={ksiDomId(block.code, `q-${q.id}`)}
                    aria-describedby={ksiDomId(block.code, "why")}
                    className={textareaClass}
                    value={saved.questions[q.id] ?? ""}
                    maxLength={limits.answer}
                    disabled={locked}
                    onChange={(e) => setKsi(block.code, { questions: { ...saved.questions, [q.id]: e.target.value } })}
                  />
                </div>
              ))}
              <p id={ksiDomId(block.code, "why")} className="text-sm text-muted-foreground">
                {block.why}
              </p>
              {block.howOften === "optional" && (
                <div className="grid gap-1.5">
                  <Label htmlFor={ksiDomId(block.code, "how-often")}>{definition.labels.howOften}</Label>
                  <input
                    id={ksiDomId(block.code, "how-often")}
                    aria-describedby={ksiDomId(block.code, "how-often-help")}
                    className={inputClass}
                    value={saved.how_often ?? ""}
                    maxLength={limits.howOften}
                    disabled={locked}
                    onChange={(e) => setKsi(block.code, { how_often: e.target.value })}
                  />
                  <p id={ksiDomId(block.code, "how-often-help")} className="text-xs text-muted-foreground">
                    {definition.labels.howOftenHelp}
                  </p>
                </div>
              )}
              {needHelp(ksiDomId(block.code, "need-help"), saved.need_help, (value) => setKsi(block.code, { need_help: value }))}
            </div>
          </details>
        );
      })}

      {(() => {
        const readiness = definition.readiness;
        const saved = answers.readiness.vulnerability_detection;
        return (
          <details className="group rounded-md border" data-ksi={readiness.key}>
            <summary className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <span className="flex-1 font-semibold">{readiness.title}</span>
              <StatusLabel status={blockStatus(readiness.questions, saved)} />
            </summary>
            <div className="grid gap-4 border-t px-4 py-4">
              <p id={ksiDomId(readiness.key, "note")} className="text-sm text-muted-foreground">
                {readiness.note}
              </p>
              {readiness.questions.map((q) => (
                <div key={q.id} className="grid gap-1.5">
                  <Label htmlFor={ksiDomId(readiness.key, `q-${q.id}`)}>
                    {q.text}
                    {q.recommended && <span className="ml-2 rounded bg-muted px-1.5 text-xs font-normal">{definition.labels.recommended}</span>}
                  </Label>
                  <textarea
                    id={ksiDomId(readiness.key, `q-${q.id}`)}
                    aria-describedby={`${ksiDomId(readiness.key, "note")} ${ksiDomId(readiness.key, `why-${q.id}`)}`}
                    className={textareaClass}
                    value={saved.questions[q.id] ?? ""}
                    maxLength={limits.answer}
                    disabled={locked}
                    onChange={(e) => setReadiness({ questions: { ...saved.questions, [q.id]: e.target.value } })}
                  />
                  <p id={ksiDomId(readiness.key, `why-${q.id}`)} className="text-sm text-muted-foreground">
                    {q.why}
                  </p>
                </div>
              ))}
              {needHelp(ksiDomId(readiness.key, "need-help"), saved.need_help, (value) => setReadiness({ need_help: value }))}
            </div>
          </details>
        );
      })()}

      {!locked && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
          <Button type="button" variant="outline" onClick={onSave} disabled={saving || Boolean(conflict)}>
            Save
          </Button>
          <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {saveText}
          </span>
        </div>
      )}
    </div>
  );
}
