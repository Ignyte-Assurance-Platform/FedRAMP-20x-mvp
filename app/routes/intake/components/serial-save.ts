/**
 * One request at a time, latest change wins (WI-006 tab 3, after the #42 review): a change made
 * while a save is in flight waits for it, then goes out alone with whatever the caller learned
 * from the answer (the new version). Changes that pile up meanwhile are merged into one.
 */
export interface SerialSave<T> {
  /** Queue this change; resolves when it (or a later change merged with it) has been sent. */
  save(change: T): Promise<void>;
  /** A change is waiting behind the save in flight. */
  hasPending(): boolean;
  /** Drop the waiting change (the stored value won, e.g. after a 409). */
  discard(): void;
}

export function createSerialSave<T>(
  send: (change: T) => Promise<void>,
  merge: (waiting: T, next: T) => T = (_, next) => next,
): SerialSave<T> {
  let pending: { change: T } | undefined;
  let running: Promise<void> | undefined;

  async function drain() {
    try {
      while (pending) {
        const { change } = pending;
        pending = undefined;
        await send(change);
      }
    } finally {
      // A send that throws must not leave the queue stuck on a rejected promise.
      running = undefined;
    }
  }

  return {
    save(change) {
      pending = pending
        ? { change: merge(pending.change, change) }
        : { change };
      running ??= drain();
      return running;
    },
    hasPending: () => pending !== undefined,
    discard() {
      pending = undefined;
    },
  };
}
