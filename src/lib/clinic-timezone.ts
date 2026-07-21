import { getSupabase } from "@/lib/supabase";

/** Fallback when the Settings table has no row yet, or the Timezone field is empty. */
export const DEFAULT_CLINIC_TIMEZONE = "America/Chicago";

const CACHE_TTL_MS = 60_000;
let cached: { value: string; expiresAt: number } | null = null;

/** True when `timezone` is a real IANA identifier `Intl` can use (e.g. "Asia/Karachi", not "Pakistan"). */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The single source of truth for "what timezone does this clinic operate in" — read from the
 * Settings table's Timezone column (editable in Settings > Clinic info). Booking availability,
 * business hours, cleanup buffers, and the AI's "today" awareness all key off this value instead
 * of a hardcoded timezone string. Cached briefly since it's called on most booking-related
 * requests; call `invalidateClinicTimezoneCache()` right after writing a new Timezone value so
 * the change takes effect immediately rather than waiting out the cache.
 *
 * Falls back to `DEFAULT_CLINIC_TIMEZONE` when the stored value isn't a valid IANA identifier
 * (e.g. a free-text label like "Pakistan" instead of "Asia/Karachi") — every `Intl`/`Date`
 * timezone conversion in the booking engine would otherwise throw.
 */
export async function getClinicTimezone(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const sb = getSupabase();
    const { data } = await sb.from("Settings").select("Timezone").limit(1).maybeSingle();
    const raw = (data?.["Timezone"] as string | undefined)?.trim();
    const timezone = raw && isValidTimezone(raw) ? raw : DEFAULT_CLINIC_TIMEZONE;
    cached = { value: timezone, expiresAt: Date.now() + CACHE_TTL_MS };
    return timezone;
  } catch {
    return cached?.value ?? DEFAULT_CLINIC_TIMEZONE;
  }
}

export function invalidateClinicTimezoneCache(): void {
  cached = null;
}
