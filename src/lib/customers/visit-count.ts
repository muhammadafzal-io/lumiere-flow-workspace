import { parseDateFromAppointment } from "@/lib/customers/last-visit";

/** Split legacy appointment history fields (semicolon or comma separated). */
export function splitAppointmentField(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Count only segments that contain a parseable visit date. */
export function countDatedAppointments(appointmentStrings: string[]): number {
  let count = 0;
  for (const segment of appointmentStrings) {
    if (parseDateFromAppointment(segment)) count++;
  }
  return count;
}

/**
 * Visit count for loyalty / campaign eligibility.
 * - Prefer dated entries in `Appointments`
 * - Fall back to `Last Visit` as at least one visit when history was never synced
 */
export function countCustomerVisits(
  appointmentsRaw: string | null | undefined,
  lastVisitField?: string | null,
): number {
  const segments = splitAppointmentField(appointmentsRaw);
  const dated = countDatedAppointments(segments);
  if (dated > 0) return dated;

  if (lastVisitField?.trim()) {
    const d = new Date(lastVisitField.trim());
    if (!isNaN(d.getTime())) return 1;
  }

  return 0;
}

export function normalizeMinVisits(minVisits: number): number {
  if (!Number.isFinite(minVisits)) return 1;
  return Math.max(1, Math.floor(minVisits));
}
