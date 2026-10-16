/** Compact date-time in New York time for admin tables, e.g. "Oct 16, 6:05 PM". */
export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export function personLabel(person: { email: string | null; name: string | null } | null, fallbackId?: string) {
  if (!person) return fallbackId ? `Unknown user ${fallbackId.slice(0, 8)}` : "Unknown user";
  return person.name || person.email || "Unnamed user";
}

/** Read a single string query param. */
export function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
