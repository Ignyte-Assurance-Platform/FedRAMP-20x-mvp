import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  asksNextReport,
  documentContentType,
  documentFileRefusal,
  documentPath,
  formatBytes,
  isCertificationOld,
  itemsFor,
  KIND_NOTE_MAX,
  OTHER_KIND,
  POLICIES_KIND,
  POLICY_VERSION_MAX,
  type CertificationAnswers,
  type CertificationKey,
  type CustomerDocument,
  type DocumentsDefinition,
} from "~/lib/documents";
import { fieldDomId } from "./form-fields";
import { uploadResumable, UploadFailedError } from "./resumable-upload";
import { createSerialSave, type SerialSave } from "./serial-save";

/**
 * Screen E tab 3 (WI-006): the certification with its 12-month warning, the drop box, the
 * "Useful things to upload" list for that certification, and the customer's files with
 * "What is this?", Rename, Replace and x. Files go straight to the bucket in a resumable session;
 * the app only records them once they arrive and pass the checks. Open before and after Submit;
 * the x is gone after Submit.
 */

export interface IntakeTab3View {
  definition: DocumentsDefinition;
  certification: CertificationAnswers;
  certificationVersion: number;
  documents: CustomerDocument[];
  submitted: boolean;
  today: string;
}

type Post = (body: Record<string, unknown>) => Promise<{ status: number; data: Record<string, unknown> } | null>;

interface Upload {
  key: string;
  name: string;
  /** 0–100 while uploading. */
  progress: number;
  message: string | null;
}

const selectClass = "h-9 rounded-md border bg-background px-2 text-sm shadow-xs";

export function IntakeTab3({
  view,
  documents,
  onDocumentsChange,
  submitted,
  post,
}: {
  view: IntakeTab3View;
  documents: CustomerDocument[];
  onDocumentsChange: (update: (current: CustomerDocument[]) => CustomerDocument[]) => void;
  submitted: boolean;
  post: Post;
}) {
  const { definition } = view;
  const [certification, setCertification] = useState(view.certification);
  const [certificationMessage, setCertificationMessage] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [rowMessages, setRowMessages] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  // Saves go out one at a time, each with the version the previous one returned (#42 review).
  // `post` is stable (useCallback on the token), so the savers can keep the first one.
  const documentSavers = useRef(new Map<string, SerialSave<Partial<CustomerDocument>>>());

  const items = itemsFor(definition, certification.type);
  const old = isCertificationOld(certification.period_end_date, view.today);

  const [certificationSaver] = useState(() => {
    let version = view.certificationVersion;
    const saver: SerialSave<CertificationAnswers> = createSerialSave(async (next) => {
      const result = await post({ intent: "certification-save", certification: next, version });
      if (result?.status === 200) {
        version = Number(result.data.version);
        setCertificationMessage(null);
      } else if (result?.status === 409) {
        // Changed in another window: show what is stored, the customer picks again if needed.
        saver.discard();
        setCertification(result.data.certification as CertificationAnswers);
        version = Number(result.data.version);
        setCertificationMessage("This was changed in another window; it now shows what is saved.");
      } else if (result && result.status !== 410) {
        setCertificationMessage(String(result.data.message ?? "Not saved. Try again."));
      } else if (!result) {
        setCertificationMessage("Not saved. Check the connection and try again.");
      }
    });
    return saver;
  });

  function saveCertification(next: CertificationAnswers) {
    setCertification(next);
    void certificationSaver.save(next);
  }

  const setRowMessage = (id: string, message: string | null) =>
    setRowMessages((current) => {
      const next = { ...current };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });

  async function upload(file: File, replaces?: string) {
    const key = `${file.name}:${file.size}:${Math.random()}`;
    const update = (patch: Partial<Upload>) => setUploads((current) => current.map((u) => (u.key === key ? { ...u, ...patch } : u)));
    const refusal = documentFileRefusal(definition, file);
    setUploads((current) => [...current, { key, name: file.name, progress: 0, message: refusal }]);
    if (refusal) return;
    const contentType = documentContentType(file.name);
    const start = await post({ intent: "document-start", filename: file.name, contentType, size: file.size, ...(replaces ? { replaces } : {}) });
    if (!start || start.status !== 200) return update({ message: String(start?.data.message ?? "The upload could not start. Try again.") });
    const { documentId, upload: session } = start.data as { documentId: string; upload: { url: string } };
    try {
      await uploadResumable({ url: session.url, file, onProgress: (stored, total) => update({ progress: Math.floor((stored / total) * 100) }) });
    } catch (error) {
      return update({ message: error instanceof UploadFailedError ? error.message : "The upload did not finish. Try again." });
    }
    const finish = await post({ intent: "document-finish", documentId, filename: file.name, size: file.size, ...(replaces ? { replaces } : {}) });
    if (!finish || finish.status !== 200) return update({ message: String(finish?.data.message ?? "The upload did not finish. Try again.") });
    const stored = finish.data.document as CustomerDocument;
    onDocumentsChange((current) => (replaces ? current.map((d) => (d.id === replaces ? stored : d)) : [...current.filter((d) => d.id !== stored.id), stored]));
    setUploads((current) => current.filter((u) => u.key !== key));
  }

  function uploadAll(files: FileList | File[]) {
    for (const file of Array.from(files)) void upload(file);
  }

  function change(doc: CustomerDocument, fields: Partial<CustomerDocument>) {
    onDocumentsChange((current) => current.map((d) => (d.id === doc.id ? { ...d, ...fields } : d)));
    let saver = documentSavers.current.get(doc.id);
    if (!saver) {
      const row: SerialSave<Partial<CustomerDocument>> = createSerialSave(
        async (pending) => {
          const result = await post({ intent: "document-update", documentId: doc.id, ...pending });
          if (result?.status === 200) {
            // A newer change is still waiting: keep what the customer typed on screen.
            if (row.hasPending()) return;
            const saved = result.data.document as CustomerDocument;
            onDocumentsChange((current) => current.map((d) => (d.id === doc.id ? saved : d)));
            setRowMessage(doc.id, null);
          } else {
            setRowMessage(doc.id, String(result?.data.message ?? "Not saved. Try again."));
          }
        },
        (waiting, next) => ({ ...waiting, ...next }),
      );
      saver = row;
      documentSavers.current.set(doc.id, saver);
    }
    void saver.save(fields);
  }

  async function remove(doc: CustomerDocument) {
    const result = await post({ intent: "document-remove", documentId: doc.id });
    if (result?.status === 200) onDocumentsChange((current) => current.filter((d) => d.id !== doc.id));
    else setRowMessage(doc.id, String(result?.data.message ?? "Not removed. Try again."));
  }

  return (
    <div className="grid gap-8">
      <fieldset className="grid gap-4">
        <legend id="certification-label" className="mb-2 font-medium">
          {definition.labels.certification}
        </legend>
        <div role="radiogroup" aria-labelledby="certification-label" className="grid gap-2 sm:grid-cols-2">
          {definition.certifications.map((option) => (
            <label key={option.key} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="certification"
                value={option.key}
                className="size-4 accent-primary"
                checked={certification.type === option.key}
                onChange={() =>
                  void saveCertification({
                    ...certification,
                    type: option.key as CertificationKey,
                    next_report_expected: asksNextReport(definition, option.key) ? certification.next_report_expected : null,
                  })
                }
              />
              {option.label}
            </label>
          ))}
        </div>
        <div className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor="period-end">{definition.labels.periodEnd}</Label>
          <Input
            id="period-end"
            type="date"
            value={certification.period_end_date ?? ""}
            onChange={(e) => void saveCertification({ ...certification, period_end_date: e.target.value || null })}
          />
        </div>
        {old && (
          <p role="status" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            {definition.messages.old}
          </p>
        )}
        {asksNextReport(definition, certification.type) && (
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="next-report">{definition.labels.nextReport}</Label>
            <Input
              id="next-report"
              type="date"
              value={certification.next_report_expected ?? ""}
              onChange={(e) => void saveCertification({ ...certification, next_report_expected: e.target.value || null })}
            />
          </div>
        )}
        {certificationMessage && (
          <p role="alert" className="text-sm text-destructive">
            {certificationMessage}
          </p>
        )}
      </fieldset>

      <section className="grid gap-3" aria-labelledby="drop-label">
        <label
          htmlFor="document-files"
          className={`grid cursor-pointer place-items-center rounded-lg border-2 border-dashed p-8 text-center text-sm ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/40"}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            uploadAll(e.dataTransfer.files);
          }}
        >
          <span id="drop-label" className="font-medium">
            {definition.labels.drop}
          </span>
          <span className="text-muted-foreground">PDF, Word, Excel, PNG, JPG, SVG, Visio, CSV, JSON, XML · up to 250 MB each</span>
        </label>
        <input
          ref={fileInput}
          id="document-files"
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) uploadAll(e.target.files);
            e.target.value = "";
          }}
        />

        {uploads.length > 0 && (
          <ul className="grid gap-2" aria-label="Uploads in progress">
            {uploads.map((u) => (
              <li key={u.key} className="grid gap-1 text-sm">
                <span>
                  {u.name} {u.message ? "" : `· ${u.progress}%`}
                </span>
                {u.message ? (
                  <span role="alert" className="text-destructive">
                    {u.message}
                  </span>
                ) : (
                  <progress max={100} value={u.progress} className="h-2 w-full" aria-label={`Uploading ${u.name}`} />
                )}
              </li>
            ))}
          </ul>
        )}

        <div>
          <h2 className="font-medium">{definition.labels.useful}</h2>
          <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm">
            {items.map((item) => (
              <li key={item.kind}>
                {item.label}
                {item.help && <span className="block text-muted-foreground">{item.help}</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid gap-3" aria-label="Your files">
        <h2 className="font-medium">Your files</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files yet.</p>
        ) : (
          <ul className="grid gap-4">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                definition={definition}
                kinds={items}
                canRemove={!submitted}
                message={rowMessages[doc.id] ?? null}
                onChange={(fields) => change(doc, fields)}
                onReplace={(file) => void upload(file, doc.id)}
                onRemove={() => void remove(doc)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DocumentRow({
  doc,
  definition,
  kinds,
  canRemove,
  message,
  onChange,
  onReplace,
  onRemove,
}: {
  doc: CustomerDocument;
  definition: DocumentsDefinition;
  kinds: { kind: string; label: string }[];
  canRemove: boolean;
  message: string | null;
  onChange: (fields: Partial<CustomerDocument>) => void;
  onReplace: (file: File) => void;
  onRemove: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(doc.displayName);
  const id = fieldDomId(documentPath(doc.id));
  const replaceInput = useRef<HTMLInputElement>(null);
  // A kind chosen while another certification was selected stays in the list.
  const options = doc.kind && doc.kind !== OTHER_KIND && !kinds.some((k) => k.kind === doc.kind)
    ? [...kinds, definition.items.find((item) => item.kind === doc.kind)!].filter(Boolean)
    : kinds;

  return (
    <li className="grid gap-3 rounded-md border p-3" data-document={doc.id}>
      <div className="flex flex-wrap items-center gap-3">
        {renaming ? (
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onChange({ displayName: name.trim() });
              setRenaming(false);
            }}
          >
            <Input aria-label="File name" value={name} maxLength={255} onChange={(e) => setName(e.target.value)} autoFocus />
            <Button type="submit" size="sm">
              Save name
            </Button>
          </form>
        ) : (
          <span className="flex-1 font-medium break-all">{doc.displayName}</span>
        )}
        <span className="text-sm text-muted-foreground">{formatBytes(doc.size)}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setRenaming((r) => !r)}>
          Rename
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => replaceInput.current?.click()}>
          Replace
        </Button>
        <input
          ref={replaceInput}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-label={`Replace ${doc.displayName}`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onReplace(file);
            e.target.value = "";
          }}
        />
        {canRemove && (
          <Button type="button" variant="outline" size="sm" aria-label={`Remove ${doc.displayName}`} onClick={onRemove}>
            ×
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{definition.labels.whatIsThis}</Label>
          <select id={id} className={selectClass} value={doc.kind ?? ""} onChange={(e) => onChange({ kind: e.target.value || null })}>
            <option value="">Choose…</option>
            {options.map((item) => (
              <option key={item.kind} value={item.kind}>
                {item.label}
              </option>
            ))}
            <option value={OTHER_KIND}>{definition.other.label}</option>
          </select>
        </div>
        {doc.kind === OTHER_KIND && (
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-note`}>{definition.labels.otherNote}</Label>
            <Input id={`${id}-note`} defaultValue={doc.kindNote ?? ""} maxLength={KIND_NOTE_MAX} onBlur={(e) => onChange({ kindNote: e.target.value })} />
          </div>
        )}
        {doc.kind === POLICIES_KIND && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-version`}>{definition.labels.policyVersion}</Label>
              <Input id={`${id}-version`} defaultValue={doc.policyVersion ?? ""} maxLength={POLICY_VERSION_MAX} onBlur={(e) => onChange({ policyVersion: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-updated`}>{definition.labels.policyUpdatedOn}</Label>
              <Input id={`${id}-updated`} type="date" value={doc.policyUpdatedOn ?? ""} onChange={(e) => onChange({ policyUpdatedOn: e.target.value || null })} />
            </div>
          </>
        )}
      </div>
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </li>
  );
}
