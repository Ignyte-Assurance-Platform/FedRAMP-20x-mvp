import { useCallback, useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { documentProblems, type CustomerDocument } from "~/lib/documents";
import type { KsisAnswers } from "~/lib/ksis";
import { checkAnswers, type FormDefinition, type FormField } from "~/lib/form-definition";
import { fieldDomId, Fields, type Answers } from "./form-fields";
import { IntakeExpired } from "./intake-expired";
import { createIntakeSaver, oneAtATime, submitAfterFlush, type Conflict, type FlushResult, type SaveState } from "./intake-saver";
import { IntakeTab2, type IntakeTab2View } from "./intake-tab2";
import { IntakeTab3, type IntakeTab3View } from "./intake-tab3";

/**
 * Screen E (WI-004): tab 1 is the generated form with Save, autosave 2 s after typing stops,
 * versioned saves with Keep mine / Take theirs, Submit, and the logo upload Ignyte hosts. Tab 3
 * (WI-006) holds the certification and the documents and stays open after Submit; Submit also
 * checks its files. Everything posts to /api/intake/<token>; the token is the only credential.
 */

export interface IntakeTab1View {
  customer: { name: string; serviceName: string | null };
  status: "not_started" | "in_progress" | "submitted";
  locked: boolean;
  definition: FormDefinition;
  answers: Answers;
  version: number;
  savedAt: Date | string | null;
  logo: { documentId: string; fileName: string; previewUrl: string } | null;
  ksis: IntakeTab2View;
  documents: IntakeTab3View;
}

export const AUTOSAVE_MS = 2000;
export const NOT_SAVED_YET = "Not saved yet. We will try again.";
export const CONFLICT_MESSAGE = "This form was changed in another window.";

interface Problem {
  path: string;
  question?: string;
  message: string;
}

const LOGO_TYPES = ["image/png", "image/jpeg"];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_MIN_WIDTH = 256;
const LOGO_INSTRUCTIONS = "Upload a PNG or JPEG logo, at least 256 px wide and up to 2 MB.";

const isDocumentPath = (path: string) => path.startsWith("/documents/");

/** Why Submit stopped before sending anything, when tab 2's pending changes could not be saved (E3b). */
export function ksisFlushMessage(result: FlushResult): string | null {
  if (result === "conflict") return "Nothing was submitted: your answers on tab 2 were changed in another window. Choose Keep mine or Take theirs there, then submit again.";
  if (result === "failed") return "Nothing was submitted: your answers on tab 2 could not be saved. Check the connection and try again.";
  if (result === "refused") return "Nothing was submitted: an answer on tab 2 could not be saved. See the message on tab 2, change it and submit again.";
  return null;
}

/** Tab 2's button: Submitted, or a hint that its answers wait for Keep mine / Take theirs (seen from tab 1). */
export function tab2Label(submitted: boolean, conflict: boolean): string {
  if (submitted) return "2. Security indicators · Submitted";
  return conflict ? "2. Security indicators · Changed in another window" : "2. Security indicators";
}

/** Submit is off while a save or Submit is on its way, or while either tab waits for Keep mine / Take theirs. */
export function submitDisabled(state: { submitting: boolean; saving: boolean; conflict: boolean; ksisConflict: boolean }): boolean {
  return state.submitting || state.saving || state.conflict || state.ksisConflict;
}

const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function imageWidth(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img.naturalWidth);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/** Browser-side logo check before any upload (2.11); the server repeats it and checks the signature. */
export function logoFileRefusal(file: { type: string; size: number }, width?: number): string | null {
  if (!LOGO_TYPES.includes(file.type)) return `This file type is not accepted. ${LOGO_INSTRUCTIONS}`;
  if (file.size > LOGO_MAX_BYTES) return `This file is larger than 2 MB. ${LOGO_INSTRUCTIONS}`;
  if (width !== undefined && width < LOGO_MIN_WIDTH) return `This image is narrower than 256 px. ${LOGO_INSTRUCTIONS}`;
  return null;
}

export function IntakeTab1({ view, token }: { view: IntakeTab1View; token: string }) {
  const endpoint = `/api/intake/${token}`;
  const [answers, setAnswers] = useState<Answers>(view.answers);
  const [locked, setLocked] = useState(view.locked);
  const [expired, setExpired] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(view.savedAt ? { kind: "saved", at: new Date(view.savedAt) } : { kind: "idle" });
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(view.locked);
  const [logo, setLogo] = useState(view.logo);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [tab, setTab] = useState<1 | 2 | 3>(1);
  const [ksisAnswers, setKsisAnswers] = useState<KsisAnswers>(view.ksis.answers);
  const [ksisSaveState, setKsisSaveState] = useState<SaveState>(view.ksis.savedAt ? { kind: "saved", at: new Date(view.ksis.savedAt) } : { kind: "idle" });
  const [ksisConflict, setKsisConflict] = useState<Conflict | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOnce] = useState(oneAtATime);
  const [documents, setDocuments] = useState<CustomerDocument[]>(view.documents.documents);


  const post = useCallback(
    async (body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> } | null> => {
      try {
        const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const data = (await response.json()) as Record<string, unknown>;
        if (response.status === 410) setExpired(String(data.message));
        if (response.status === 423) {
          setLocked(true);
          setSubmitted(true);
        }
        return { status: response.status, data };
      } catch {
        return null;
      }
    },
    [endpoint],
  );

  // Save, autosave 2 s after the last change, and Submit, one request at a time (E2).
  const [saver] = useState(() =>
    createIntakeSaver({
      post,
      answers: view.answers,
      version: view.version,
      delayMs: AUTOSAVE_MS,
      onState: setSaveState,
      onConflict: setConflict,
    }),
  );
  useEffect(() => saver.pause(locked), [locked, saver]);
  // Tab 2 (WI-005 E3): its own section, same rules: autosave, one request at a time, Keep mine / Take theirs.
  const [ksisSaver] = useState(() =>
    createIntakeSaver({
      post,
      answers: view.ksis.answers as unknown as Answers,
      version: view.ksis.version,
      delayMs: AUTOSAVE_MS,
      onState: setKsisSaveState,
      onConflict: setKsisConflict,
      section: "ksis",
    }),
  );
  useEffect(() => ksisSaver.pause(locked || Boolean(ksisConflict)), [locked, ksisConflict, ksisSaver]);

  function changeKsis(next: KsisAnswers) {
    setKsisAnswers(next);
    ksisSaver.changed(next as unknown as Answers);
  }

  function change(next: Answers) {
    setAnswers(next);
    saver.changed(next);
  }

  async function submit() {
    setSubmitError(null);
    // "Submitting…" from the first click, through tab 2's flush too.
    setSubmitting(true);
    try {
      // E3b: tab 2's pending changes are saved first; if that fails or conflicts, nothing is submitted.
      const outcome = await submitAfterFlush([ksisSaver], checkAndSubmit);
      if ("stopped" in outcome) {
        const message = ksisFlushMessage(outcome.stopped);
        if (message) setSubmitError(message);
        if (outcome.stopped === "conflict" || outcome.stopped === "refused") setTab(2);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function checkAndSubmit() {
    const local = [...checkAnswers(view.definition.fields, answers, "", Boolean(logo)), ...documentProblems(documents)];
    if (local.length) {
      setProblems(local);
      focusFirst(local);
      return;
    }
    const result = await saver.submit();
    if (!result || result.status >= 500) {
      setSaveState({ kind: "failed" });
      return;
    }
    if (result.status === 409) {
      setConflict({ answers: result.data.answers as Answers, version: Number(result.data.version) });
      return;
    }
    if (result.status === 422) {
      setSaveState({ kind: "saved", at: new Date(String(result.data.savedAt)) });
      const found = result.data.problems as Problem[];
      setProblems(found);
      focusFirst(found);
      return;
    }
    if (result.status === 200) {
      setProblems([]);
      setLocked(true);
      setSubmitted(true);
      return;
    }
    if (result.status !== 410 && result.status !== 423) {
      setSaveState({ kind: "failed", message: typeof result.data.message === "string" ? result.data.message : undefined });
    }
  }

  function focusFirst(found: Problem[]) {
    const first = found[0];
    if (!first) return;
    setTab(isDocumentPath(first.path) ? 3 : 1);
    requestAnimationFrame(() => document.getElementById(fieldDomId(nearestField(first.path)))?.focus());
  }

  function nearestField(path: string): string {
    const parts = path.split("/").filter(Boolean);
    for (let i = parts.length; i > 0; i--) {
      const candidate = `/${parts.slice(0, i).join("/")}`;
      if (typeof document !== "undefined" && document.getElementById(fieldDomId(candidate))) return candidate;
    }
    return path;
  }

  async function uploadLogo(file: File) {
    setLogoMessage(null);
    const early = logoFileRefusal(file);
    if (early) return setLogoMessage(early);
    const width = await imageWidth(file);
    const narrow = logoFileRefusal(file, width);
    if (narrow) return setLogoMessage(narrow);
    setLogoBusy(true);
    try {
      const start = await post({ intent: "logo-start", filename: file.name, contentType: file.type, size: file.size, width });
      if (!start || start.status !== 200) return setLogoMessage(String(start?.data.message ?? LOGO_INSTRUCTIONS));
      const upload = start.data.upload as { url: string; method: string; headers: Record<string, string> };
      const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: file });
      if (!put.ok) return setLogoMessage(`The upload did not finish. ${LOGO_INSTRUCTIONS}`);
      const finish = await post({ intent: "logo-finish", logoId: start.data.logoId, filename: file.name, contentType: file.type });
      if (!finish || finish.status !== 200) return setLogoMessage(String(finish?.data.message ?? LOGO_INSTRUCTIONS));
      setLogo(finish.data.logo as IntakeTab1View["logo"]);
      setProblems((current) => current.filter((p) => p.path !== "/serviceIdentification/logo"));
    } finally {
      setLogoBusy(false);
    }
  }

  if (expired) return <IntakeExpired message={expired} />;

  const problemMap = new Map(problems.map((p) => [p.path, p.message]));
  const textOf = (state: SaveState) =>
    state.kind === "saving"
      ? "Saving…"
      : state.kind === "saved"
        ? `Saved ${timeFormat.format(state.at)}`
        : state.kind === "failed"
          ? (state.message ?? NOT_SAVED_YET)
          : "";
  const saveText = textOf(saveState);

  const renderLogo = (field: FormField, describedBy: string | undefined) => (
    <div className="grid gap-2">
      {logo && (
        <div className="flex items-center gap-3">
          <img src={logo.previewUrl} alt="Your uploaded logo" className="h-16 w-auto rounded border bg-white p-1" />
          <span className="text-sm text-muted-foreground">{logo.fileName}</span>
        </div>
      )}
      {!locked && (
        <input
          id={fieldDomId(field.path)}
          type="file"
          accept="image/png,image/jpeg"
          aria-describedby={describedBy}
          disabled={logoBusy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadLogo(file);
            e.target.value = "";
          }}
          className="text-sm"
        />
      )}
      {!locked && logo && <p className="text-xs text-muted-foreground">Choose another file to replace the logo.</p>}
      {logoBusy && <p className="text-sm text-muted-foreground">Uploading…</p>}
      {logoMessage && (
        <p role="alert" className="text-sm text-destructive">
          {logoMessage}
        </p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto grid max-w-3xl gap-3 px-6 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Ignyte · FedRAMP 20x intake</p>
            <h1 className="text-2xl font-semibold">{view.customer.name}</h1>
            {view.customer.serviceName && <p className="text-muted-foreground">{view.customer.serviceName}</p>}
          </div>
          <nav aria-label="Intake tabs">
            <ol className="grid grid-cols-3 gap-2 text-sm">
              <li>
                <button
                  type="button"
                  aria-current={tab === 1 ? "step" : undefined}
                  onClick={() => setTab(1)}
                  className={`w-full rounded-md border-b-4 px-2 py-1 text-left ${tab === 1 ? "border-primary font-medium" : "border-muted text-muted-foreground"}`}
                >
                  1. Company &amp; service{submitted ? " · Submitted" : ""}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  aria-current={tab === 2 ? "step" : undefined}
                  onClick={() => setTab(2)}
                  className={`w-full rounded-md border-b-4 px-2 py-1 text-left ${tab === 2 ? "border-primary font-medium" : "border-muted text-muted-foreground"}`}
                >
                  {tab2Label(submitted, Boolean(ksisConflict))}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  aria-current={tab === 3 ? "step" : undefined}
                  onClick={() => setTab(3)}
                  className={`w-full rounded-md border-b-4 px-2 py-1 text-left ${tab === 3 ? "border-primary font-medium" : "border-muted text-muted-foreground"}`}
                >
                  3. Documents{documents.length ? ` · ${documents.length}` : ""}
                </button>
              </li>
            </ol>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-3xl gap-6 px-6 py-8">
        {submitted && (
          <p role="status" className="rounded-md border border-green-600/40 bg-green-600/10 p-3 text-sm">
            Submitted. Tabs 1 and 2 are now read-only; your Ignyte consultant can unlock them if something needs to change. You can still add documents.
          </p>
        )}

        {conflict && (
          <div role="alert" className="grid gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
            <p className="font-medium">{CONFLICT_MESSAGE}</p>
            <p>Keep your answers on this page, or load the answers saved from the other window.</p>
            <div className="flex gap-3">
              <Button
                type="button"
                onClick={() => {
                  const theirs = conflict.version;
                  setConflict(null);
                  void saver.save(theirs);
                }}
              >
                Keep mine
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  saver.takeTheirs(conflict);
                  setAnswers(conflict.answers);
                  setConflict(null);
                  setSaveState({ kind: "idle" });
                }}
              >
                Take theirs
              </Button>
            </div>
          </div>
        )}

        {problems.length > 0 && (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">{problems.length === 1 ? "1 answer needs attention before you submit." : `${problems.length} answers need attention before you submit.`}</p>
            <ul className="mt-2 grid list-disc gap-1 pl-5">
              {problems.map((p) => (
                <li key={`${p.path}:${p.message}`}>
                  <a href={`#${fieldDomId(nearestField(p.path))}`} onClick={() => setTab(isDocumentPath(p.path) ? 3 : 1)} className="underline">
                    {p.message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {submitError && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {submitError}
          </p>
        )}

        <div hidden={tab !== 2}>
          <IntakeTab2
            view={view.ksis}
            answers={ksisAnswers}
            onChange={changeKsis}
            locked={locked}
            saveText={textOf(ksisSaveState)}
            saving={ksisSaveState.kind === "saving"}
            onSave={() => void ksisSaver.save()}
            conflict={ksisConflict}
            onKeepMine={() => {
              const theirs = ksisConflict!.version;
              setKsisConflict(null);
              setSubmitError(null);
              void ksisSaver.save(theirs);
            }}
            onTakeTheirs={() => {
              ksisSaver.takeTheirs(ksisConflict!);
              setKsisAnswers(ksisConflict!.answers as unknown as KsisAnswers);
              setKsisConflict(null);
              setSubmitError(null);
              setKsisSaveState({ kind: "idle" });
            }}
          />
        </div>

        <div hidden={tab !== 3}>
          <IntakeTab3
            view={view.documents}
            documents={documents}
            onDocumentsChange={(update) => {
              setDocuments(update);
              setProblems((current) => current.filter((p) => !isDocumentPath(p.path)));
            }}
            submitted={submitted}
            post={post}
          />
        </div>

        <form
          hidden={tab !== 1}
          className="grid gap-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submitOnce(submit);
          }}
        >
          <Fields fields={view.definition.fields} value={answers} pointer="" onChange={change} ctx={{ disabled: locked, problems: problemMap, root: answers, renderLogo }} />

          {!locked && (
            <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
              <Button type="button" variant="outline" onClick={() => void saver.save()} disabled={saveState.kind === "saving" || submitting || Boolean(conflict)}>
                Save
              </Button>
              <Button
                type="submit"
                disabled={submitDisabled({ submitting, saving: saveState.kind === "saving", conflict: Boolean(conflict), ksisConflict: Boolean(ksisConflict) })}
              >
                {submitting ? "Submitting…" : "Submit"}
              </Button>
              <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
                {saveText}
              </span>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
