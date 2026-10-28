/**
 * Save, autosave and Submit of Screen E tabs 1 and 2 (WI-004 E2, WI-005 E3), kept apart from
 * React so the ordering can be tested with a mocked fetch. One request at a time: Submit waits
 * for the save in flight and sends the version it returned, so a window never conflicts with
 * itself. Tab 2 uses its own saver with `section: "ksis"`; Submit flushes it first (E3b).
 */

export type Answers = Record<string, unknown>;
export type PostResult = { status: number; data: Record<string, unknown> } | null;
export type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: Date } | { kind: "failed"; message?: string };
/** How flush() ended: nothing left to save, or why something is still unsaved. */
export type FlushResult = "saved" | "failed" | "conflict" | "closed";
export interface Conflict {
  answers: Answers;
  version: number;
}

export interface IntakeSaverOptions {
  post: (body: Record<string, unknown>) => Promise<PostResult>;
  answers: Answers;
  version: number;
  delayMs: number;
  onState: (state: SaveState) => void;
  onConflict: (conflict: Conflict) => void;
  /** The intake section this saver writes; tab 1's when left out. */
  section?: "company" | "ksis";
}

export interface IntakeSaver {
  /** The customer changed an answer: these answers are saved after the delay. */
  changed(answers: Answers): void;
  /** Save now (the Save button, Keep mine with the stored version). */
  save(overrideVersion?: number): Promise<void>;
  /** Submit: waits for any save in flight, then posts with the current version. */
  submit(): Promise<PostResult>;
  /** Saves every pending change now, waiting for the save in flight; "saved" only when nothing is left unsaved (E3b). */
  flush(): Promise<FlushResult>;
  /** Take theirs: the stored answers and version replace the page's, nothing left to save. */
  takeTheirs(conflict: Conflict): void;
  /** A conflict is waiting for the customer's choice: no autosave until resumed. */
  pause(paused: boolean): void;
  readonly version: number;
}

export function createIntakeSaver(options: IntakeSaverOptions): IntakeSaver {
  let version = options.version;
  let answers = options.answers;
  let dirty = false;
  let paused = false;
  let submitting = false;
  // Submitted or locked: nothing more is saved, and late answers are ignored.
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let last: FlushResult = "saved";
  const sectionField = options.section ? { section: options.section } : {};

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = () => {
    clear();
    if (dirty && !paused && !done) timer = setTimeout(() => void save(), options.delayMs);
  };

  async function run(override?: number): Promise<void> {
    dirty = false;
    options.onState({ kind: "saving" });
    const result = await options.post({ intent: "save", ...sectionField, answers, version: override ?? version });
    if (done) return;
    if (!result || result.status >= 500) {
      // Network or server trouble: keep the changes and try again.
      last = "failed";
      dirty = true;
      options.onState({ kind: "failed" });
      return schedule();
    }
    if (result.status === 200) {
      last = "saved";
      version = Number(result.data.version);
      options.onState({ kind: "saved", at: new Date(String(result.data.savedAt)) });
      // Typed while this save was in flight: those changes still need a save.
      return schedule();
    }
    if (result.status === 409) {
      last = "conflict";
      paused = true;
      options.onState({ kind: "idle" });
      options.onConflict({ answers: result.data.answers as Answers, version: Number(result.data.version) });
      return;
    }
    if (result.status === 410 || result.status === 423) {
      last = "closed";
      done = true;
      return;
    }
    // Refused as sent (too large, unreadable): retrying the same answers would fail again.
    last = "failed";
    dirty = true;
    options.onState({ kind: "failed", message: typeof result.data.message === "string" ? result.data.message : undefined });
  }

  function save(override?: number): Promise<void> {
    if (done) return Promise.resolve();
    if (override !== undefined) paused = false;
    if (submitting || paused) return Promise.resolve();
    clear();
    // A save is already on its way; the changes since are picked up when it returns.
    if (inFlight) return inFlight;
    inFlight = run(override).finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }

  async function submit(): Promise<PostResult> {
    if (done) return null;
    clear();
    submitting = true;
    try {
      if (inFlight) await inFlight;
      if (paused || done) return null;
      // Submit saves what it sends; only changes typed after this point are left to save.
      const wasDirty = dirty;
      dirty = false;
      const result = await options.post({ intent: "submit", answers, version });
      if (!result || result.status >= 500) {
        dirty = dirty || wasDirty;
        return result;
      }
      if (result.status === 200 || result.status === 410 || result.status === 423) {
        done = true;
        dirty = false;
      } else if (result.status === 422) {
        version = Number(result.data.version);
      } else if (result.status === 409) {
        paused = true;
        dirty = true;
      } else {
        dirty = dirty || wasDirty;
      }
      return result;
    } finally {
      submitting = false;
      schedule();
    }
  }

  async function flush(): Promise<FlushResult> {
    clear();
    if (inFlight) await inFlight;
    // Each round saves what was typed while the previous one was on its way; a failure stops it.
    while (dirty && !paused && !done) {
      last = "saved";
      await save();
      if (last !== "saved") break;
    }
    if (paused) return "conflict";
    // A save answered 410 or 423: what it carried was not stored.
    if (last === "closed") return "closed";
    return dirty ? (last === "saved" ? "failed" : last) : "saved";
  }

  return {
    flush,
    changed(next) {
      answers = next;
      dirty = true;
      schedule();
    },
    save,
    submit,
    takeTheirs(stored) {
      answers = stored.answers;
      version = stored.version;
      dirty = false;
      paused = false;
      clear();
    },
    pause(value) {
      paused = value;
      if (value) clear();
      else schedule();
    },
    get version() {
      return version;
    },
  };
}
