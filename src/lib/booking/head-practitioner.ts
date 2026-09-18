import { getSupabase } from "@/lib/supabase";
import { getAppBaseUrl } from "@/lib/client-channels";

/**
 * The clinic's head practitioner — who signs off bookings of services configured to require it.
 *
 * Stored as an id on the Settings singleton beside the clinic's other configuration, never as a
 * name in code, so it can be reassigned from the admin UI without a deploy.
 */

export interface HeadPractitioner {
  id: string;
  name: string;
  email: string | null;
}

const CACHE_TTL_MS = 60_000;
let cached: { value: HeadPractitioner | null; expiresAt: number } | null = null;

export function invalidateHeadPractitionerCache(): void {
  cached = null;
}

export async function getHeadPractitioner(): Promise<HeadPractitioner | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value: HeadPractitioner | null = null;
  try {
    const sb = getSupabase();
    const { data: settings } = await sb
      .from("Settings")
      .select("HeadPractitionerId")
      .limit(1)
      .maybeSingle();
    const id = (settings as { HeadPractitionerId?: string } | null)?.HeadPractitionerId;
    if (id) {
      const { data: practitioner } = await sb
        .from("Practitioners")
        .select("id, Name, Email")
        .eq("id", id)
        .maybeSingle();
      if (practitioner) {
        value = {
          id: String(practitioner.id),
          name: practitioner["Name"] ?? "Head practitioner",
          email: practitioner["Email"] ?? null,
        };
      }
    }
  } catch (err) {
    console.error("[approvals] getHeadPractitioner failed:", err);
    return cached?.value ?? null;
  }

  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

/**
 * Tells the head practitioner a booking is waiting on them. Best-effort and never throws — the
 * booking is already on the calendar, and the queue in the admin UI is the reliable channel; this
 * email is a prompt, not the record.
 */
export async function notifyHeadPractitionerOfPendingApproval(booking: {
  serviceName: string;
  clientName: string;
  startTime: string;
  practitionerName?: string;
  timezone: string;
}): Promise<void> {
  try {
    const head = await getHeadPractitioner();
    if (!head?.email) {
      console.warn("[approvals] no head practitioner email configured — skipping notification");
      return;
    }

    const when = new Date(booking.startTime).toLocaleString("en-US", {
      timeZone: booking.timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    // Imported here rather than at module load: the email stack is server-only, and this module is
    // reached from the booking path that unit tests exercise without a mail provider.
    const { sendRetentionEmail } = await import("@/lib/integrations/email");
    await sendRetentionEmail({
      to: head.email,
      subject: `Sign-off needed: ${booking.serviceName} on ${when}`,
      text: `Hi ${head.name.split(" ")[0]},

A booking is waiting for your sign-off.

Service: ${booking.serviceName}
Client: ${booking.clientName}
When: ${when}
Practitioner: ${booking.practitionerName || "Unassigned"}

Open the approvals queue to approve or reject it.`,
      cta: { label: "Review booking", url: `${getAppBaseUrl()}/approvals` },
      logMeta: {
        category: "general",
        triggerType: "system",
        sourceName: "booking approval",
      },
    });
  } catch (err) {
    console.error("[approvals] notifyHeadPractitionerOfPendingApproval failed:", err);
  }
}
