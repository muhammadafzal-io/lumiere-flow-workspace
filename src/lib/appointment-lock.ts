/**
 * Whether an appointment is permanently read-only: true once its END time has passed. An
 * appointment that has started but not yet ended is still fully editable — "past" means over,
 * not merely underway. Comparing absolute instants (ISO timestamps carry their own offset, `now`
 * is a Date/epoch-ms) is timezone-invariant, so no clinic-timezone plumbing is needed here —
 * timezone only matters for how a time is displayed, not whether it has passed.
 */
export function isAppointmentPast(
  endTime: string | Date,
  now: Date | number = new Date(),
): boolean {
  const endMs = endTime instanceof Date ? endTime.getTime() : new Date(endTime).getTime();
  const nowMs = typeof now === "number" ? now : now.getTime();
  return endMs < nowMs;
}

export const PAST_APPOINTMENT_ERROR_CODE = "APPOINTMENT_PAST";
export const PAST_APPOINTMENT_LOCK_MESSAGE =
  "This appointment has already ended and can no longer be modified.";
