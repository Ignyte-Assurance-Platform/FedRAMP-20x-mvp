/**
 * Tab 3 rules shared by the browser and the server (WI-006 §3, §5): which items a certification
 * shows, which files are accepted, the 12-month warning and what blocks Submit. The labels and
 * texts come from form-definitions/documents.v1.json; nothing here reads or stores anything.
 */

export type CertificationKey = "soc2_type2" | "fedramp_ready" | "fedramp_rev5" | "govramp";

export interface DocumentItem {
  kind: string;
  label: string;
  /** The grey line under the label. */
  help?: string;
  shownTo: CertificationKey[] | "everyone";
}

export interface DocumentsDefinition {
  form: "documents";
  revision: number;
  labels: Record<"certification" | "periodEnd" | "nextReport" | "useful" | "drop" | "whatIsThis" | "otherNote" | "policyVersion" | "policyUpdatedOn", string>;
  messages: Record<"old" | "type" | "zip" | "size", string>;
  certifications: { key: CertificationKey; label: string }[];
  items: DocumentItem[];
  other: { kind: "other"; label: string };
  /** Certifications that also ask "Expected date of the next report". */
  nextReportFor: CertificationKey[];
}

/** Tab 3 answers (intake_answers, section "documents"). */
export interface CertificationAnswers {
  type: CertificationKey | null;
  period_end_date: string | null;
  next_report_expected: string | null;
}

export const EMPTY_CERTIFICATION: CertificationAnswers = { type: null, period_end_date: null, next_report_expected: null };

export const POLICIES_KIND = "policies";
export const OTHER_KIND = "other";
export const KIND_NOTE_MAX = 200;
export const POLICY_VERSION_MAX = 50;
export const DISPLAY_NAME_MAX = 255;
/** 250 MB per file (§5). */
export const DOCUMENT_MAX_BYTES = 250 * 1024 * 1024;

export type Signature = "pdf" | "png" | "jpeg" | "ole2" | "zip-container" | "text";

/** §5: accepted extensions, the content type each one is stored with, and the signature it must start with. */
export const ACCEPTED_EXTENSIONS: Record<string, { contentType: string; signature: Signature }> = {
  pdf: { contentType: "application/pdf", signature: "pdf" },
  doc: { contentType: "application/msword", signature: "ole2" },
  docx: { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", signature: "zip-container" },
  xls: { contentType: "application/vnd.ms-excel", signature: "ole2" },
  xlsx: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", signature: "zip-container" },
  png: { contentType: "image/png", signature: "png" },
  jpg: { contentType: "image/jpeg", signature: "jpeg" },
  jpeg: { contentType: "image/jpeg", signature: "jpeg" },
  svg: { contentType: "image/svg+xml", signature: "text" },
  vsd: { contentType: "application/vnd.visio", signature: "ole2" },
  vsdx: { contentType: "application/vnd.ms-visio.drawing.main+xml", signature: "zip-container" },
  csv: { contentType: "text/csv", signature: "text" },
  json: { contentType: "application/json", signature: "text" },
  xml: { contentType: "application/xml", signature: "text" },
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

/**
 * The content type a file is stored with, taken from its extension: browsers report Visio, CSV
 * and JSON inconsistently, so the extension decides and the server checks the pair.
 */
export function documentContentType(filename: string): string | null {
  return ACCEPTED_EXTENSIONS[extensionOf(filename)]?.contentType ?? null;
}

/** The checks run before any upload (2.9, 2.10), in the browser and again on the server. */
export function documentFileRefusal(definition: Pick<DocumentsDefinition, "messages">, file: { name: string; size: number }): string | null {
  const extension = extensionOf(file.name);
  if (extension === "zip") return definition.messages.zip;
  if (!ACCEPTED_EXTENSIONS[extension]) return definition.messages.type;
  if (file.size > DOCUMENT_MAX_BYTES) return definition.messages.size;
  if (file.size <= 0) return "This file is empty.";
  return null;
}

const startsWith = (bytes: Uint8Array, prefix: number[]) => bytes.length >= prefix.length && prefix.every((b, i) => bytes[i] === b);

/**
 * The finish check on the first bytes (2.8): PDF %PDF-, PNG and JPEG as the logo, OLE2 for
 * doc/xls/vsd, a ZIP container (PK\x03\x04) for docx/xlsx/vsdx; text types have no signature and
 * are refused only when a NUL byte shows they are binary.
 */
export function signatureMatches(signature: Signature, bytes: Uint8Array): boolean {
  switch (signature) {
    case "pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "ole2":
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "zip-container":
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case "text":
      return !bytes.includes(0);
  }
}

/** 2.1–2.3: the certification's own items, then the "Everyone" items; before a choice, only those. */
export function itemsFor(definition: Pick<DocumentsDefinition, "items">, certification: CertificationKey | null): DocumentItem[] {
  const own = certification ? definition.items.filter((item) => item.shownTo !== "everyone" && item.shownTo.includes(certification)) : [];
  return [...own, ...definition.items.filter((item) => item.shownTo === "everyone")];
}

export function asksNextReport(definition: Pick<DocumentsDefinition, "nextReportFor">, certification: CertificationKey | null): boolean {
  return certification !== null && definition.nextReportFor.includes(certification);
}

export function kindLabel(definition: Pick<DocumentsDefinition, "items" | "other">, kind: string | null): string | null {
  if (!kind) return null;
  if (kind === definition.other.kind) return definition.other.label;
  return definition.items.find((item) => item.kind === kind)?.label ?? null;
}

export function isKnownKind(definition: Pick<DocumentsDefinition, "items" | "other">, kind: string): boolean {
  return kindLabel(definition, kind) !== null;
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 2.4: the period end date is more than 12 months before today (both YYYY-MM-DD). Never blocks. */
export function isCertificationOld(periodEnd: string | null, today: string): boolean {
  if (!periodEnd || !ISO_DATE.test(periodEnd) || !ISO_DATE.test(today)) return false;
  const yearAgo = `${String(Number(today.slice(0, 4)) - 1).padStart(4, "0")}${today.slice(4)}`;
  return periodEnd < yearAgo;
}

const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/** Today in FedRAMP's timezone (ET) as YYYY-MM-DD, so the 12-month warning flips at ET midnight. */
export function todayIso(now: Date = new Date()): string {
  return isoDay.format(now);
}

/** What the customer sees and edits for one current file. */
export interface CustomerDocument {
  id: string;
  displayName: string;
  size: number;
  kind: string | null;
  kindNote: string | null;
  policyVersion: string | null;
  policyUpdatedOn: string | null;
}

export interface DocumentProblem {
  path: string;
  message: string;
}

export const documentPath = (id: string) => `/documents/${id}`;

/** 2.11: Submit is blocked while a file has no "What is this?", an Other has no note, or a policy lacks its version or date. */
export function documentProblems(documents: CustomerDocument[]): DocumentProblem[] {
  const problems: DocumentProblem[] = [];
  for (const doc of documents) {
    const name = `“${doc.displayName}”`;
    const path = documentPath(doc.id);
    if (!doc.kind) problems.push({ path, message: `${name}: choose what this file is (“What is this?”).` });
    else if (doc.kind === OTHER_KIND && !doc.kindNote?.trim()) problems.push({ path, message: `${name}: add a short note for “Other”.` });
    else if (doc.kind === POLICIES_KIND) {
      if (!doc.policyVersion?.trim()) problems.push({ path, message: `${name}: add the policy version.` });
      if (!doc.policyUpdatedOn) problems.push({ path, message: `${name}: add the date the policy was last updated.` });
    }
  }
  return problems;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
