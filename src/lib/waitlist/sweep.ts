/**
 * Cron-driven expiry sweep — finds WaitlistOffers whose claim window has passed without a
 * response, expires them, and advances each to the next matching candidate via
 * offerSlotToWaitlist. Mirrors runFormReminderFlow's structure (one query, per-item processing,
 * standard RetentionResult return shape) so it fits the same /api/cron/<name> wrapper pattern
 * every other scheduled job in this app already uses.
 */
import { getSupabase } from "@/lib/supabase";
import { logEvent } from "@/lib/integrations/activity-log";
import { getWaitlistEntryById } from "@/lib/waitlist/store";
import { mapOfferRow } from "@/lib/waitlist/offer-types";
import { offerSlotToWaitlist, type FreedSlot } from "@/lib/waitlist/matching";
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
