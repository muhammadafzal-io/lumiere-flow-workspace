/** No buffer between appointments — slots are strictly back-to-back. */
export const SLOT_BUFFER_MINUTES = 0;

/** Kept for compatibility; slot step is now dynamic (= appointment duration). */
export const SLOT_STEP_MINUTES = 0;

export const SLOT_BUFFER_MS = 0;
export const SLOT_STEP_MS = 0;

/**
 * True when two intervals need at least `bufferMinutes` between them (defaults to
 * SLOT_BUFFER_MINUTES). Pass a resource's own cleanup/reset minutes here instead of the
 * default when checking room/equipment conflicts so each resource gets its own turnover time.
 */
export function intervalsConflict(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
  bufferMinutes: number = SLOT_BUFFER_MINUTES,
): boolean {
  const bufferMs = bufferMinutes * 60_000;
  return (
    aStart.getTime() < bEnd.getTime() + bufferMs && bStart.getTime() < aEnd.getTime() + bufferMs
  );
}

/** Plain overlap check with no turnover buffer — for hard exclusions like closed times or time off. */
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}
