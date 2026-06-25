const DATE_RE = /[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2},\s*\d{4}|^\d{4}-\d{2}-\d{2}/;

export function parseDateFromAppointment(appt: string): string | null {
  const match = appt.match(DATE_RE);
  if (!match) return null;
  const date = new Date(match[0]);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

/** Prefer explicit Last Visit column; fall back to latest appointment date. */
export function deriveLastVisit(
  lastVisitField: string | null | undefined,
  appointmentStrings: string[],
): string {
  if (lastVisitField?.trim()) {
    const d = new Date(lastVisitField);
    if (!isNaN(d.getTime())) return lastVisitField.trim();
  }
  let latest: Date | null = null;
  for (const appt of appointmentStrings) {
    const iso = parseDateFromAppointment(appt);
    if (!iso) continue;
    const d = new Date(iso);
    if (!latest || d > latest) latest = d;
  }
  return latest ? latest.toISOString() : "";
}

export function formatLastVisit(iso: string | undefined | null): string {
  if (!iso?.trim()) return "No visits recorded";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "No visits recorded";
  return d.toLocaleDateString();
}
