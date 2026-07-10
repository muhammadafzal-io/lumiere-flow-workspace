import { getSupabase } from "@/lib/supabase";

export interface ClinicConfig {
  clinicName: string;
  timezone: string;
  /** Full mailing address — used in emails, SMS, maps links. */
  address: string;
  /** Short display location (city/country) — used in system prompts and email headers. */
  location: string;
  businessHours: string;
}

const FALLBACK: ClinicConfig = {
  clinicName: "Lumière Med Spa",
  timezone: "America/Chicago",
  address: "2847 S Lamar Blvd, Suite 120, Austin TX 78704",
  location: "Austin, Texas",
  businessHours: "Mon–Sat 9:00 AM – 7:00 PM",
};

let _cached: ClinicConfig | null = null;
let _cachedAt = 0;
const TTL_MS = 5 * 60_000; // 5-minute in-process cache

/** Returns true when tz is a valid IANA timezone identifier. */
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Derive a short "City, State" label from a full mailing address. */
function locationFromAddress(address: string): string {
  const parts = address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    // "2847 S Lamar, Suite 120, Austin TX 78704" → look for city+state part
    const cityPart = parts.find((p, i) => i > 0 && !/^(\d|Suite|Ste|Unit|Floor|#)/i.test(p));
    if (cityPart) return cityPart;
  }
  if (parts.length >= 2) return parts[parts.length - 1];
  return address;
}

/** Load clinic configuration from Supabase with a 5-minute in-process cache. */
export async function getClinicConfig(): Promise<ClinicConfig> {
  if (_cached && Date.now() - _cachedAt < TTL_MS) return _cached;
  try {
    const sb = getSupabase();
    const { data } = await sb.from("Settings").select("*").limit(1).maybeSingle();
    if (data) {
      const address = (data["Address"] as string | undefined) || FALLBACK.address;
      _cached = {
        clinicName: (data["Clinic Name"] as string | undefined) || FALLBACK.clinicName,
        timezone: isValidTimezone((data["Timezone"] as string | undefined) ?? "")
          ? (data["Timezone"] as string)
          : FALLBACK.timezone,
        address,
        // "Location" column stores the display name; fall back to deriving from address.
        location:
          (data["Location"] as string | undefined) ||
          locationFromAddress(address) ||
          FALLBACK.location,
        businessHours: (data["Business Hours"] as string | undefined) || FALLBACK.businessHours,
      };
      _cachedAt = Date.now();
      return _cached;
    }
  } catch {
    // Supabase unreachable — return fallback, do not cache failure
  }
  return FALLBACK;
}

/** Bust the cache immediately — call this after saving clinic settings. */
export function invalidateClinicConfigCache(): void {
  _cached = null;
  _cachedAt = 0;
}

export async function getClinicTimezone(): Promise<string> {
  return (await getClinicConfig()).timezone;
}
