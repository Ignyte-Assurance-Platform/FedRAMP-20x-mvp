import { isRouteErrorResponse } from "react-router";

/**
 * WI-020: the intake token is the customer's only credential (wi-004 E5), so it never goes to
 * the server logs. Replaces the segment after `intake/` (or percent-encoded `intake%2F`) with
 * [redacted]; the rest of the text is kept so intake errors can still be debugged.
 */
const INTAKE_TOKEN = /(intake(?:\/|%2F))[^/?#&%\s"'`\\]+/gi;

export const REDACTED = "[redacted]";

export function redactIntakeToken(text: string): string {
  return text.replace(INTAKE_TOKEN, `$1${REDACTED}`);
}

/** A copy of the error with the token redacted in its message and stack; same type, nothing else changed. */
function redactError(error: Error): Error {
  const copy = Object.assign(Object.create(Object.getPrototypeOf(error) as object) as Error, error);
  Object.defineProperty(copy, "message", { value: redactIntakeToken(error.message), writable: true, configurable: true });
  if (error.stack !== undefined) Object.defineProperty(copy, "stack", { value: redactIntakeToken(error.stack), writable: true, configurable: true });
  return copy;
}

/** What the server logs for an error: errors and strings redacted, a route error response's inner error or text data too. */
export function redactForLog(error: unknown): unknown {
  if (error instanceof Error) return redactError(error);
  if (typeof error === "string") return redactIntakeToken(error);
  if (isRouteErrorResponse(error)) {
    // React Router keeps the wrapped Error in a private `error` field; its default logs that one.
    const inner = (error as { error?: unknown }).error;
    if (inner instanceof Error) return redactError(inner);
    return { ...error, data: typeof error.data === "string" ? redactIntakeToken(error.data) : error.data };
  }
  return error;
}
