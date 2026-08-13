/**
 * Matches a just-freed (room, practitioner, equipment, time) slot — from a cancellation or
 * reschedule — against open Waitlist entries, and orchestrates offering it to the best candidate
 * one at a time. See migrations/create_waitlist_offers.sql for the table this maps.
 */
import crypto from "crypto";
import { getSupabase } from "@/lib/supabase";
import { getClinicTimezone } from "@/lib/clinic-config";
import { dateInZone, timeKeyInTz } from "@/lib/booking/dates";
import { logEvent } from "@/lib/integrations/activity-log";
import { attachClientContactToRows, type WaitlistEntry } from "@/lib/waitlist/store";
import { sendWaitlistOfferNotification } from "@/lib/waitlist/notify";
import { mapOfferRow, type WaitlistOffer } from "@/lib/waitlist/offer-types";

const TABLE = "WaitlistOffers";

/** How long a customer has to accept before the offer moves on to the next candidate. One place
 * to tune this — matches this codebase's existing convention for tunables like
 * SLOT_BUFFER_MINUTES rather than scattering the number across every call site. */
export const WAITLIST_OFFER_CLAIM_WINDOW_MS = 2 * 60 * 60_000;

/** A time-of-day tolerance for a lone preferred_time_start with no end — "around 3pm" should
 * still match a slot that opened at 2:40 or 3:20, not just exactly 3:00. */
const SINGLE_TIME_TOLERANCE_MS = 60 * 60_000;

export interface FreedSlot {
  treatment: string;
  serviceId: string | null;
  startTime: string;
  endTime: string;
  practitionerName: string | null;
  room: string | null;
  equipment: string[];
  sourceEventId: string;
}

/** True if a waitlist entry's preferences are compatible with a freed slot. Pure function, no
 * I/O, so it's independently testable and reused by both the initial match and any future
 * "would this entry match" check (e.g. staff's manual "Check now" button). */
export function waitlistEntryMatchesSlot(
  entry: WaitlistEntry,
  slot: FreedSlot,
  tz: string,
): boolean {
  const serviceMatches =
    entry.serviceId && slot.serviceId
      ? entry.serviceId === slot.serviceId
      : entry.treatment.trim().toLowerCase() === slot.treatment.trim().toLowerCase();
  if (!serviceMatches) return false;

  const slotDate = dateInZone(slot.startTime, tz);
  if (entry.preferredDate !== slotDate) return false;

  if (entry.preferredTimeStart && entry.preferredTimeEnd) {
    const slotTime = timeKeyInTz(slot.startTime, tz);
    const start = entry.preferredTimeStart.slice(0, 5);
    const end = entry.preferredTimeEnd.slice(0, 5);
    if (slotTime < start || slotTime > end) return false;
  } else if (entry.preferredTimeStart) {
    const preferredMs = timeStringToMsSinceMidnight(entry.preferredTimeStart);
    const slotMs = timeStringToMsSinceMidnight(timeKeyInTz(slot.startTime, tz) + ":00");
    if (Math.abs(preferredMs - slotMs) > SINGLE_TIME_TOLERANCE_MS) return false;
  }

  if (
    entry.preferredPractitionerName &&
    entry.preferredPractitionerName.trim().toLowerCase() !==
      (slot.practitionerName ?? "").trim().toLowerCase()
  ) {
    return false;
  }

  return true;
}

function timeStringToMsSinceMidnight(hms: string): number {
  const [h, m, s] = hms.split(":").map(Number);
  return ((h || 0) * 3600 + (m || 0) * 60 + (s || 0)) * 1000;
}

/** Open (Waiting-only — Contacted means staff already has a manual thread going, don't
 * auto-interrupt that) waitlist candidates matching a freed slot, oldest-first (first come,
 * first served), excluding anyone already offered this exact slot before. */
export async function findMatchingWaitlistCandidates(
  slot: FreedSlot,
  excludeWaitlistIds: string[],
): Promise<WaitlistEntry[]> {
  const sb = getSupabase();
  const tz = await getClinicTimezone();

  let query = sb
    .from("Waitlist")
    .select("*")
    .eq("status", "Waiting")
    .eq("preferred_date", dateInZone(slot.startTime, tz))
    .order("created_at", { ascending: true });
  if (excludeWaitlistIds.length > 0) {
    query = query.not("id", "in", `(${excludeWaitlistIds.join(",")})`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`findMatchingWaitlistCandidates: ${error.message}`);

  const entries = await attachClientContactToRows(data ?? []);
  return entries.filter((e) => waitlistEntryMatchesSlot(e, slot, tz));
}

/**
 * Offers a freed slot to the next best-matching waitlist candidate, if any. Called right after a
 * cancellation/reschedule frees a slot, and again whenever an offer is declined, expires, or is
 * superseded (the slot turned out to be taken before it was accepted) — each time excluding every
 * waitlist entry already offered this exact slot, so the sequence always advances rather than
 * looping back. Never throws — matching/offering is a best-effort enhancement layered on top of
 * the calendar mutation that freed the slot, which must never be affected by a failure here.
 */
export async function offerSlotToWaitlist(slot: FreedSlot): Promise<void> {
  try {
    const sb = getSupabase();
    const { data: priorOffers } = await sb
      .from(TABLE)
      .select("waitlist_id")
      .eq("source_event_id", slot.sourceEventId);
    const excludeIds = (priorOffers ?? []).map((r: any) => r.waitlist_id as string);

    const candidates = await findMatchingWaitlistCandidates(slot, excludeIds);
    if (candidates.length === 0) {
      await logEvent(
        "waitlist",
        "—",
        `No waitlist match for freed slot (${slot.treatment}, ${slot.startTime})`,
        {},
      ).catch(() => undefined);
      return;
    }

    const candidate = candidates[0];
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + WAITLIST_OFFER_CLAIM_WINDOW_MS).toISOString();

    const { data: offerRow, error } = await sb
      .from(TABLE)
      .insert({
        waitlist_id: candidate.id,
        token,
        slot_start: slot.startTime,
        slot_end: slot.endTime,
        treatment: slot.treatment,
        service_id: slot.serviceId,
        practitioner_name: slot.practitionerName,
        room: slot.room,
        equipment: slot.equipment,
        source_event_id: slot.sourceEventId,
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (error) throw new Error(`offerSlotToWaitlist insert: ${error.message}`);

    const offer = mapOfferRow(offerRow);
    await logEvent(
      "waitlist",
      candidate.clientName,
      `Waitlist match found for ${slot.treatment} — offering slot, expires ${expiresAt}`,
      { clientId: candidate.clientId, phone: candidate.clientPhone ?? undefined },
    ).catch(() => undefined);

    await sendWaitlistOfferNotification(offer, candidate);

    await logEvent(
      "waitlist",
      candidate.clientName,
      `Waitlist offer notification sent for ${slot.treatment}`,
      { clientId: candidate.clientId, phone: candidate.clientPhone ?? undefined },
    ).catch(() => undefined);
  } catch (err) {
    console.error("[offerSlotToWaitlist] failed:", err);
  }
}

/** The most recent WaitlistOffer per waitlist entry (if any) — backs the staff Waitlist page's
 * "Offer sent, expires..." line, so staff can see the automated flow's progress without a
 * separate screen. */
export async function listLatestOffersForWaitlistIds(
  waitlistIds: string[],
): Promise<Map<string, WaitlistOffer>> {
  const result = new Map<string, WaitlistOffer>();
  if (waitlistIds.length === 0) return result;

  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .in("waitlist_id", waitlistIds)
    .order("created_at", { ascending: false });
  if (error || !data) return result;

  for (const row of data) {
    if (!result.has(row.waitlist_id)) result.set(row.waitlist_id, mapOfferRow(row));
  }
  return result;
}
