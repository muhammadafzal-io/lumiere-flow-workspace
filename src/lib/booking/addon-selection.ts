import type { ServiceAddonRow } from "@/lib/booking/recipe";

export interface AddonSelectionResult {
  /** Add-ons actually applied to the booking — active, and named in `selectedNames`. */
  matched: ServiceAddonRow[];
  /** Names the client picked that no longer resolve to an active add-on (inactive, renamed,
   * removed since they were offered) — surfaced so the caller can tell the client rather than
   * silently dropping them. */
  unavailable: string[];
  extraDurationMinutes: number;
  /** Sum of matched add-ons' price. Add-ons with no price set don't contribute (not treated as $0
   * of upsell value one way or the other — just excluded from the total). */
  extraPrice: number;
}

/**
 * Matches the client's accepted add-on names against the candidate add-ons for a service,
 * case-insensitively, filtering to Active only and de-duplicating repeats. This is the single
 * place "was this a real, still-bookable add-on" is decided — both the AI booking tool and any
 * future caller (e.g. a staff-facing booking UI) can reuse it instead of re-deriving the match.
 *
 * `candidates` is not assumed pre-filtered to Active — filtering happens here too, so an add-on
 * deactivated after being offered (but before the client confirmed) is correctly excluded even if
 * a caller passes the full unfiltered list.
 */
export function resolveSelectedAddons(
  candidates: ServiceAddonRow[],
  selectedNames: string[],
): AddonSelectionResult {
  const active = candidates.filter((a) => a.status === "Active");
  const byName = new Map(active.map((a) => [a.name.trim().toLowerCase(), a]));

  const matched: ServiceAddonRow[] = [];
  const unavailable: string[] = [];
  const seen = new Set<string>();

  for (const rawName of selectedNames) {
    const key = rawName.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const addon = byName.get(key);
    if (addon) matched.push(addon);
    else unavailable.push(rawName);
  }

  const extraDurationMinutes = matched.reduce((sum, a) => sum + a.durationMinutes, 0);
  const extraPrice = matched.reduce((sum, a) => sum + (a.price ?? 0), 0);

  return { matched, unavailable, extraDurationMinutes, extraPrice };
}

/** Renders matched add-ons as a short "Add-ons: X ($30), Y" line appended to booking notes —
 * omitted entirely (returns "") when nothing was selected, so notes are byte-for-byte unchanged
 * for the (overwhelmingly common, pre-existing) no-add-ons booking path. */
export function formatAddonsForNotes(matched: ServiceAddonRow[]): string {
  if (matched.length === 0) return "";
  const items = matched.map((a) => (a.price != null ? `${a.name} ($${a.price})` : a.name));
  return `Add-ons: ${items.join(", ")}`;
}
