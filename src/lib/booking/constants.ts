/** Gap between consecutive appointments (turnover / prep time). */
export const SLOT_BUFFER_MINUTES = 5;

/** Granularity when scanning the calendar for open slots. */
export const SLOT_STEP_MINUTES = 5;

export const SLOT_BUFFER_MS = SLOT_BUFFER_MINUTES * 60_000;
export const SLOT_STEP_MS = SLOT_STEP_MINUTES * 60_000;

/** True when two intervals need at least SLOT_BUFFER_MINUTES between them. */
export function intervalsConflict(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return (
    aStart.getTime() < bEnd.getTime() + SLOT_BUFFER_MS &&
    bStart.getTime() < aEnd.getTime() + SLOT_BUFFER_MS
  );
}
