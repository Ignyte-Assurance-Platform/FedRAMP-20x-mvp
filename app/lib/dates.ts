/**
 * Dates shown to Ignyte staff are written in FedRAMP's timezone with an explicit zone, so
 * the server render and the browser render agree (no hydration mismatch).
 */
const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

export function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${dateTime.format(date)} ET`;
}
