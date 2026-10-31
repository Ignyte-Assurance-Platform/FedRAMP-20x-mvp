import { isRouteErrorResponse } from "react-router";

/**
 * WI-020: the intake token is the customer's only credential (wi-004 E5), so it never goes to
 * the server logs. Replaces the token after `intake/` (or percent-encoded `intake%2F`) with
 * [redacted]; the rest of the text is kept so intake errors can still be debugged.
 * A token is 24 random bytes in base64url, exactly 32 characters (generateIntakeToken, WI-003 E3);
 * matching only that keeps route ids and file paths under `routes/intake/` readable.
 */
const INTAKE_TOKEN = /(intake(?:\/|%2F))[A-Za-z0-9_-]{32}(?![A-Za-z0-9_-])/gi;

export const REDACTED = "[redacted]";

export function redactIntakeToken(text: string): string {
  return text.replace(INTAKE_TOKEN, `$1${REDACTED}`);
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactIntakeToken(value);
  if (value instanceof Error) return redactCopy(value, seen);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, seen));
  return value;
}

/**
 * A copy with the same prototype and every own property, enumerable or not (message, stack,
 * cause, AggregateError's errors, Node's `input`/`code`…), with strings and nested errors redacted.
 * The original is never changed.
 */
function redactCopy<T extends object>(source: T, seen = new WeakSet<object>()): T {
  if (seen.has(source)) return source;
  seen.add(source);
  const descriptors = Object.getOwnPropertyDescriptors(source) as Record<PropertyKey, PropertyDescriptor>;
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key]!;
    // V8 keeps `stack` as an own accessor: read it once and store the redacted text.
    const value = "value" in descriptor ? descriptor.value : (source as Record<PropertyKey, unknown>)[key];
    descriptors[key] = { value: redactValue(value, seen), writable: true, configurable: true, enumerable: descriptor.enumerable ?? false };
  }
  return Object.create(Object.getPrototypeOf(source) as object | null, descriptors) as T;
}

/** What the server logs for an error: errors and strings redacted, a route error response's inner error or the response itself. */
export function redactForLog(error: unknown): unknown {
  if (typeof error === "string") return redactIntakeToken(error);
  if (isRouteErrorResponse(error)) {
    // React Router keeps the wrapped Error in a private `error` field; its default logs that one.
    const inner = (error as { error?: unknown }).error;
    return redactCopy(inner instanceof Error ? inner : error);
  }
  if (error instanceof Error) return redactCopy(error);
  return error;
}
