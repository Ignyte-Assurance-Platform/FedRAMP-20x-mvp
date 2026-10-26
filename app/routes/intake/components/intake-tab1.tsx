import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { checkAnswers, type FormDefinition, type FormField } from "~/lib/form-definition";
import { fieldDomId, Fields, type Answers } from "./form-fields";
import { IntakeExpired } from "./intake-expired";

/**
 * Screen E tab 1 (WI-004): the generated form with Save, autosave 2 s after typing stops,
 * versioned saves with Keep mine / Take theirs, Submit, and the logo upload Ignyte hosts.
 * Everything posts to /api/intake/<token>; the token is the only credential.
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
}

export const AUTOSAVE_MS = 2000;
export const NOT_SAVED_YET = "Not saved yet. We will try again.";
export const CONFLICT_MESSAGE = "This form was changed in another window.";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: Date } | { kind: "failed" };
interface Conflict {
  answers: Answers;
  version: number;
}
interface Problem {
  path: string;
  question?: string;
  message: string;
}

const LOGO_TYPES = ["image/png", "image/jpeg"];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_MIN_WIDTH = 256;
const LOGO_INSTRUCTIONS = "Upload a PNG or JPEG logo, at least 256 px wide and up to 2 MB.";

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

  const version = useRef(view.version);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  // What the next save sends; kept in step with the state by change() and Take theirs.
  const latest = useRef(answers);

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

  const save = useCallback(
    async (overrideVersion?: number) => {
      if (inFlight.current || locked) return;
      inFlight.current = true;
      dirty.current = false;
      setSaveState({ kind: "saving" });
      const result = await post({ intent: "save", answers: latest.current, version: overrideVersion ?? version.current });
      inFlight.current = false;
      if (!result || result.status >= 500 || result.status === 400) {
        dirty.current = true;
        setSaveState({ kind: "failed" });
        return;
      }
      if (result.status === 409) {
        setConflict({ answers: result.data.answers as Answers, version: Number(result.data.version) });
        setSaveState({ kind: "idle" });
        return;
      }
      if (result.status === 200) {
        version.current = Number(result.data.version);
        setSaveState({ kind: "saved", at: new Date(String(result.data.savedAt)) });
      }
    },
    [locked, post],
  );

  // Autosave: 2 s after the last change, unless a conflict waits for the customer's choice.
  useEffect(() => {
    if (!dirty.current || conflict || locked) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [answers, conflict, locked, save]);

  function change(next: Answers) {
    dirty.current = true;
    latest.current = next;
    setAnswers(next);
  }

  async function submit() {
    const local = checkAnswers(view.definition.fields, answers, "", Boolean(logo));
    if (local.length) {
      setProblems(local);
      focusFirst(local);
      return;
    }
    setSubmitting(true);
    const result = await post({ intent: "submit", answers: latest.current, version: version.current });
    setSubmitting(false);
    if (!result) {
      setSaveState({ kind: "failed" });
      return;
    }
    if (result.status === 409) {
      setConflict({ answers: result.data.answers as Answers, version: Number(result.data.version) });
      return;
    }
    if (result.status === 422) {
      version.current = Number(result.data.version);
      setSaveState({ kind: "saved", at: new Date(String(result.data.savedAt)) });
      const found = result.data.problems as Problem[];
      setProblems(found);
      focusFirst(found);
      return;
    }
    if (result.status === 200) {
      dirty.current = false;
      setProblems([]);
      setLocked(true);
      setSubmitted(true);
    }
  }

  function focusFirst(found: Problem[]) {
    const first = found[0];
    if (!first) return;
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
  const saveText =
    saveState.kind === "saving"
      ? "Saving…"
      : saveState.kind === "saved"
        ? `Saved ${timeFormat.format(saveState.at)}`
        : saveState.kind === "failed"
          ? NOT_SAVED_YET
          : "";

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
              <li aria-current="step" className="rounded-md border-b-4 border-primary px-2 py-1 font-medium">
                1. Company &amp; service{submitted ? " · Submitted" : ""}
              </li>
              <li className="rounded-md border-b-4 border-muted px-2 py-1 text-muted-foreground">2. Security indicators · coming soon</li>
              <li className="rounded-md border-b-4 border-muted px-2 py-1 text-muted-foreground">3. Documents · coming soon</li>
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
                  void save(theirs);
                }}
              >
                Keep mine
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  version.current = conflict.version;
                  dirty.current = false;
                  latest.current = conflict.answers;
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
                  <a href={`#${fieldDomId(nearestField(p.path))}`} className="underline">
                    {p.message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form
          className="grid gap-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Fields fields={view.definition.fields} value={answers} pointer="" onChange={change} ctx={{ disabled: locked, problems: problemMap, root: answers, renderLogo }} />

          {!locked && (
            <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
              <Button type="button" variant="outline" onClick={() => void save()} disabled={saveState.kind === "saving" || Boolean(conflict)}>
                Save
              </Button>
              <Button type="submit" disabled={submitting || Boolean(conflict)}>
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
