/**
 * Cron-driven expiry sweep — finds WaitlistOffers whose claim window has passed without a
 * response, expires them, and advances each to the next matching candidate via
 * offerSlotToWaitlist. Mirrors runFormReminderFlow's structure (one query, per-item processing,
 * standard RetentionResult return shape) so it fits the same /api/cron/<name> wrapper pattern
 * every other scheduled job in this app already uses.
 */
import { getSupabase } from "@/lib/supabase";
import { logEvent } from "@/lib/integrations/activity-log";
import { getWaitlistEntryById, expirePastDateWaitlistEntries } from "@/lib/waitlist/store";
import { mapOfferRow } from "@/lib/waitlist/offer-types";
import { offerSlotToWaitlist, type FreedSlot } from "@/lib/waitlist/matching";
import { getClinicTimezone } from "@/lib/clinic-config";
import { todayInTz } from "@/lib/booking/dates";
import type { RetentionResult } from "@/types";

const TABLE = "WaitlistOffers";

export async function runWaitlistOfferSweepFlow(): Promise<RetentionResult> {
  const result: RetentionResult = { sent: 0, skipped: 0, failed: 0, details: [] };
  const sb = getSupabase();

  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
  if (error) throw new Error(`runWaitlistOfferSweepFlow: ${error.message}`);

  for (const row of data ?? []) {
    const offer = mapOfferRow(row);
    const entry = await getWaitlistEntryById(offer.waitlistId).catch(() => null);

    try {
      const { error: updateError } = await sb
        .from(TABLE)
        .update({ status: "expired", responded_at: new Date().toISOString() })
        .eq("id", offer.id)
        .eq("status", "pending");
      if (updateError) throw new Error(updateError.message);

      await logEvent(
        "waitlist",
        entry?.clientName ?? "—",
        `Waitlist offer expired (no response) for ${offer.treatment}`,
        { clientId: entry?.clientId, phone: entry?.clientPhone ?? undefined },
      ).catch(() => undefined);

      const slot: FreedSlot = {
        treatment: offer.treatment,
        serviceId: offer.serviceId,
        startTime: offer.slotStart,
        endTime: offer.slotEnd,
        practitionerName: offer.practitionerName,
        room: offer.room,
        equipment: offer.equipment,
        sourceEventId: offer.sourceEventId,
      };
      await offerSlotToWaitlist(slot);

      result.sent++;
      result.details.push({
        clientId: entry?.clientId ?? "",
        clientName: entry?.clientName,
        status: "success",
      });
    } catch (err) {
      result.failed++;
      result.details.push({
        clientId: entry?.clientId ?? "",
        clientName: entry?.clientName,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Retires Waiting/Contacted entries whose preferred_date has already passed — without this, an
 * unmatched entry sits forever, since matching only ever considers newly-freed slots on or after
 * today. Runs daily alongside runWaitlistOfferSweepFlow from the same cron route.
 */
export async function runWaitlistExpirySweepFlow(): Promise<RetentionResult> {
  const tz = await getClinicTimezone();
  const today = todayInTz(tz);
  const expiredCount = await expirePastDateWaitlistEntries(today);

  if (expiredCount > 0) {
    await logEvent(
      "waitlist",
      "—",
      `Expired ${expiredCount} waitlist ${expiredCount === 1 ? "entry" : "entries"} with a preferred date before ${today}`,
      {},
    ).catch(() => undefined);
  }

  return { sent: expiredCount, skipped: 0, failed: 0, details: [] };
}
