/** No buffer between appointments — slots are strictly back-to-back. */
export const SLOT_BUFFER_MINUTES = 0;

/** Kept for compatibility; slot step is now dynamic (= appointment duration). */
export const SLOT_STEP_MINUTES = 0;

export const SLOT_BUFFER_MS = 0;
export const SLOT_STEP_MS = 0;

/** True when two intervals need at least SLOT_BUFFER_MINUTES between them. */
export function intervalsConflict(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return (
    aStart.getTime() < bEnd.getTime() + SLOT_BUFFER_MS &&
    bStart.getTime() < aEnd.getTime() + SLOT_BUFFER_MS
  );
}
