/**
 * Data access for the appointment Waitlist — captures a caller's preferred slot when the AI
 * agent (voice/chat/Discord) can't offer it and they don't take the alternatives, so the lead
 * isn't lost. Also used by staff for phone-call/walk-in requests. See
 * migrations/create_waitlist.sql for the table this maps.
 */
import { getSupabase } from "@/lib/supabase";
import { resolveServiceId } from "@/lib/booking/recipe";
import { getClientById } from "@/lib/integrations/airtable";
import { getClinicTimezone } from "@/lib/clinic-config";
import { todayInTz } from "@/lib/booking/dates";

const TABLE = "Waitlist";

export type WaitlistStatus = "Waiting" | "Contacted" | "Booked" | "Cancelled" | "Expired";
export type WaitlistSource = "voice" | "chat" | "discord" | "admin";

export interface WaitlistEntry {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  treatment: string;
  serviceId: string | null;
  preferredDate: string;
  preferredTimeStart: string | null;
  preferredTimeEnd: string | null;
  preferredPractitionerId: string | null;
  preferredPractitionerName: string | null;
  flexibility: string | null;
  status: WaitlistStatus;
  notes: string | null;
  source: WaitlistSource;
  bookedEventId: string | null;
  contactedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(
  r: any,
  clientContact?: { phone: string | null; email: string | null },
): WaitlistEntry {
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    clientPhone: clientContact?.phone ?? null,
    clientEmail: clientContact?.email ?? null,
    treatment: r.treatment,
    serviceId: r.service_id,
    preferredDate: r.preferred_date,
    preferredTimeStart: r.preferred_time_start,
    preferredTimeEnd: r.preferred_time_end,
    preferredPractitionerId: r.preferred_practitioner_id,
    preferredPractitionerName: r.preferred_practitioner_name,
    flexibility: r.flexibility,
    status: r.status,
    notes: r.notes,
    source: r.source,
    bookedEventId: r.booked_event_id,
    contactedAt: r.contacted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface CreateWaitlistEntryInput {
  clientId: string;
  clientName: string;
  treatment: string;
  preferredDate: string;
  preferredTimeStart?: string | null;
  preferredTimeEnd?: string | null;
  preferredPractitionerId?: string | null;
  preferredPractitionerName?: string | null;
  flexibility?: string | null;
  notes?: string | null;
  source: WaitlistSource;
}

const OPEN_STATUSES: WaitlistStatus[] = ["Waiting", "Contacted"];

/** How many open (Waiting/Contacted) entries the same treatment+date combination can carry
 * before new sign-ups are turned away — prevents one popular slot from collecting an unbounded
 * queue where most people have no realistic chance of ever being matched. A plain constant
 * (matching SLOT_BUFFER_MINUTES/WAITLIST_OFFER_CLAIM_WINDOW_MS's tunable-constant convention)
 * rather than a Settings-table field — bump this directly if the clinic wants a different limit. */
export const MAX_WAITLIST_PER_SLOT = 5;

/** Count of open (Waiting/Contacted) entries for a given treatment+date — backs both the cap
 * check in createWaitlistEntry and informational queue-size reporting ("you're one of N people
 * waiting"). Deliberately not a strict rank-in-line: a dedupe-refresh of an existing entry keeps
 * its original created_at, so "total open count" is accurate queue size but not necessarily this
 * specific entry's position — reporting size avoids that ambiguity while still being useful. */
export async function countOpenWaitlistForSlot(
  treatment: string,
  preferredDate: string,
  excludeId?: string,
): Promise<number> {
  const sb = getSupabase();
  let query = sb
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("treatment", treatment)
    .eq("preferred_date", preferredDate)
    .in("status", OPEN_STATUSES);
  if (excludeId) query = query.neq("id", excludeId);
  const { count, error } = await query;
  if (error) throw new Error(`countOpenWaitlistForSlot: ${error.message}`);
  return count ?? 0;
}

/** Resolves the waitlist cap that applies to a given service — the Service's own WaitlistCap
 * override when staff have set one (Settings → Services), otherwise MAX_WAITLIST_PER_SLOT.
 * serviceId can be null (treatment didn't resolve to a known Service), which just falls back
 * to the flat default rather than failing the whole waitlist flow. */
async function waitlistCapForService(
  sb: ReturnType<typeof getSupabase>,
  serviceId: string | null,
): Promise<number> {
  if (!serviceId) return MAX_WAITLIST_PER_SLOT;
  const { data } = await sb
    .from("Services")
    .select("WaitlistCap")
    .eq("id", serviceId)
    .maybeSingle();
  const cap = data?.["WaitlistCap"];
  return typeof cap === "number" && cap > 0 ? cap : MAX_WAITLIST_PER_SLOT;
}

/**
 * Creates a new waitlist entry, unless an open (Waiting/Contacted) entry already exists for the
 * same client + treatment + preferred date — in which case that existing row is refreshed in
 * place instead of creating a duplicate. Mirrors the dedupe-before-insert pattern
 * findOpenCompletionByPhone already establishes for duplicate-pending-booking detection.
 *
 * A genuinely new entry (no dedupe match) is rejected once the treatment+date combination is
 * already at MAX_WAITLIST_PER_SLOT — refreshing your own existing entry is never blocked by the
 * cap, since that isn't adding a new person to the queue.
 */
export async function createWaitlistEntry(input: CreateWaitlistEntryInput): Promise<WaitlistEntry> {
  const sb = getSupabase();
  const serviceId = await resolveServiceId(sb, input.treatment).catch(() => null);
  const client = await getClientById(input.clientId).catch(() => null);
  const clientContact = { phone: client?.phone ?? null, email: client?.email ?? null };

  const { data: existing } = await sb
    .from(TABLE)
    .select("id")
    .eq("client_id", input.clientId)
    .eq("treatment", input.treatment)
    .eq("preferred_date", input.preferredDate)
    .in("status", OPEN_STATUSES)
    .maybeSingle();

  const patch = {
    client_name: input.clientName,
    service_id: serviceId,
    preferred_time_start: input.preferredTimeStart ?? null,
    preferred_time_end: input.preferredTimeEnd ?? null,
    preferred_practitioner_id: input.preferredPractitionerId ?? null,
    preferred_practitioner_name: input.preferredPractitionerName ?? null,
    flexibility: input.flexibility ?? null,
    notes: input.notes ?? null,
  };

  if (existing) {
    const { data, error } = await sb
      .from(TABLE)
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(`createWaitlistEntry (update): ${error.message}`);
    return mapRow(data, clientContact);
  }

  const cap = await waitlistCapForService(sb, serviceId);
  const openCount = await countOpenWaitlistForSlot(input.treatment, input.preferredDate);
  if (openCount >= cap) {
    throw new Error(
      `This slot's waitlist is already full (${cap} waiting for ${input.treatment} on ${input.preferredDate}) — try a different date or time.`,
    );
  }

  const { data, error } = await sb
    .from(TABLE)
    .insert({
      client_id: input.clientId,
      treatment: input.treatment,
      preferred_date: input.preferredDate,
      source: input.source,
      ...patch,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createWaitlistEntry (insert): ${error.message}`);
  return mapRow(data, clientContact);
}

/** Batch-attaches client phone/email to raw Waitlist rows — the same Clients-table batch lookup
 * listWaitlistEntries already does, extracted so other query shapes (e.g. the waitlist-matching
 * candidate search, which needs its own filters) can reuse it without duplicating the lookup. */
async function attachClientContact(rows: any[]): Promise<WaitlistEntry[]> {
  if (rows.length === 0) return [];
  const sb = getSupabase();
  const clientIds = [...new Set(rows.map((r) => r.client_id))];
  const contactByClientId = new Map<string, { phone: string | null; email: string | null }>();
  if (clientIds.length > 0) {
    const { data: clients } = await sb
      .from("Clients")
      .select("id, Phone, Email")
      .in("id", clientIds);
    for (const c of clients ?? []) {
      contactByClientId.set(c.id, { phone: c.Phone ?? null, email: c.Email ?? null });
    }
  }
  return rows.map((r) => mapRow(r, contactByClientId.get(r.client_id)));
}

export async function listWaitlistEntries(filters?: {
  status?: WaitlistStatus;
  clientId?: string;
}): Promise<WaitlistEntry[]> {
  const sb = getSupabase();
  let query = sb.from(TABLE).select("*").order("preferred_date", { ascending: true });
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.clientId) query = query.eq("client_id", filters.clientId);
  const { data, error } = await query;
  if (error) throw new Error(`listWaitlistEntries: ${error.message}`);
  return attachClientContact(data ?? []);
}

/** Same client-contact-attach step as listWaitlistEntries, but for a caller-supplied set of raw
 * rows — used by waitlist/matching.ts, which needs its own filter shape (status + preferred_date
 * + id exclusion) that doesn't fit listWaitlistEntries' filter set. */
export async function attachClientContactToRows(rows: any[]): Promise<WaitlistEntry[]> {
  return attachClientContact(rows);
}

export async function getWaitlistEntryById(id: string): Promise<WaitlistEntry | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const [entry] = await attachClientContact([data]);
  return entry;
}

/** Marks one specific waitlist entry Booked — unlike closeMatchingWaitlistEntries (which closes
 * every open entry matching a client+treatment pair), this targets the exact entry a
 * WaitlistOffer was created for, since acceptWaitlistOffer already knows precisely which row. */
export async function markWaitlistBooked(
  id: string,
  bookedEventId: string,
): Promise<WaitlistEntry> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .update({ status: "Booked", booked_event_id: bookedEventId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`markWaitlistBooked: ${error.message}`);
  return mapRow(data);
}

export async function updateWaitlistStatus(
  id: string,
  status: WaitlistStatus,
): Promise<WaitlistEntry> {
  const sb = getSupabase();
  const patch: Record<string, unknown> = { status };
  if (status === "Contacted") patch.contacted_at = new Date().toISOString();

  const { data, error } = await sb.from(TABLE).update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(`updateWaitlistStatus: ${error.message}`);
  return mapRow(data);
}

export interface UpdateWaitlistEntryInput {
  treatment?: string;
  preferredDate?: string;
  preferredTimeStart?: string | null;
  preferredTimeEnd?: string | null;
  preferredPractitionerName?: string | null;
  flexibility?: string | null;
  notes?: string | null;
}

/**
 * Edits an existing entry's preferences — distinct from updateWaitlistStatus, which only ever
 * changes status. If treatment or preferred date actually changes while the entry is still open,
 * re-checks MAX_WAITLIST_PER_SLOT against the new slot (excluding this entry itself, since
 * moving an existing person isn't adding a new one) and re-resolves service_id for a new
 * treatment string.
 *
 * An Expired entry whose date is moved to today-or-later is revived back to Waiting — the whole
 * point of editing a stale entry's date is to give it another shot, and matching only ever
 * considers status = 'Waiting'. A Cancelled entry is left alone: that status reflects a deliberate
 * decision (staff or client), not something an unrelated date correction should silently undo.
 */
export async function updateWaitlistEntry(
  id: string,
  input: UpdateWaitlistEntryInput,
): Promise<WaitlistEntry> {
  const sb = getSupabase();
  const { data: current, error: fetchError } = await sb
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw new Error(`updateWaitlistEntry: ${fetchError.message}`);
  if (!current) throw new Error("Waitlist entry not found");

  const nextTreatment = input.treatment ?? current.treatment;
  const nextDate = input.preferredDate ?? current.preferred_date;
  const slotChanged = nextTreatment !== current.treatment || nextDate !== current.preferred_date;

  const nextServiceId =
    input.treatment !== undefined
      ? await resolveServiceId(sb, input.treatment).catch(() => null)
      : current.service_id;

  if (slotChanged && OPEN_STATUSES.includes(current.status)) {
    const cap = await waitlistCapForService(sb, nextServiceId);
    const openCount = await countOpenWaitlistForSlot(nextTreatment, nextDate, id);
    if (openCount >= cap) {
      throw new Error(
        `This slot's waitlist is already full (${cap} waiting for ${nextTreatment} on ${nextDate}) — try a different date or time.`,
      );
    }
  }

  const patch: Record<string, unknown> = {};
  if (input.treatment !== undefined) {
    patch.treatment = input.treatment;
    patch.service_id = nextServiceId;
  }
  if (input.preferredDate !== undefined) patch.preferred_date = input.preferredDate;
  if (input.preferredTimeStart !== undefined) patch.preferred_time_start = input.preferredTimeStart;
  if (input.preferredTimeEnd !== undefined) patch.preferred_time_end = input.preferredTimeEnd;
  if (input.preferredPractitionerName !== undefined) {
    patch.preferred_practitioner_name = input.preferredPractitionerName;
  }
  if (input.flexibility !== undefined) patch.flexibility = input.flexibility;
  if (input.notes !== undefined) patch.notes = input.notes;

  if (current.status === "Expired" && input.preferredDate !== undefined) {
    const tz = await getClinicTimezone();
    if (input.preferredDate >= todayInTz(tz)) patch.status = "Waiting";
  }

  const { data, error } = await sb.from(TABLE).update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(`updateWaitlistEntry: ${error.message}`);
  return mapRow(data);
}

/**
 * Called right after a booking succeeds to close out any open waitlist entries the same client
 * had for the same treatment. Throws on failure — the caller (book_appointment's handler) is
 * expected to `.catch()` this the same way confirmation-email.ts guards `trackRequiredForms`,
 * since this bookkeeping step must never affect the actual booking result.
 */
export async function closeMatchingWaitlistEntries(
  clientId: string,
  treatment: string,
  bookedEventId: string,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from(TABLE)
    .update({ status: "Booked", booked_event_id: bookedEventId })
    .eq("client_id", clientId)
    .eq("treatment", treatment)
    .in("status", OPEN_STATUSES);
  if (error) throw new Error(`closeMatchingWaitlistEntries: ${error.message}`);
}

/**
 * Retires every open (Waiting/Contacted) entry whose preferred_date has already passed — without
 * this, an unmatched entry sits forever, since matching only ever considers newly-freed slots on
 * or after today. Called daily by runWaitlistExpirySweepFlow (src/lib/waitlist/sweep.ts).
 * Returns the number of entries expired.
 */
export async function expirePastDateWaitlistEntries(todayDateStr: string): Promise<number> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .update({ status: "Expired" })
    .in("status", OPEN_STATUSES)
    .lt("preferred_date", todayDateStr)
    .select("id");
  if (error) throw new Error(`expirePastDateWaitlistEntries: ${error.message}`);
  return data?.length ?? 0;
}

/** Permanently removes a waitlist entry — e.g. a duplicate, a mistaken entry, or one a staff
 * member no longer wants cluttering the list. WaitlistOffers rows referencing this entry are
 * removed automatically (ON DELETE CASCADE, see migrations/create_waitlist_offers.sql), so no
 * separate cleanup is needed here. */
export async function deleteWaitlistEntry(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(`deleteWaitlistEntry: ${error.message}`);
}
