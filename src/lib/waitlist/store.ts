/**
 * Data access for the appointment Waitlist — captures a caller's preferred slot when the AI
 * agent (voice/chat/Discord) can't offer it and they don't take the alternatives, so the lead
 * isn't lost. Also used by staff for phone-call/walk-in requests. See
 * migrations/create_waitlist.sql for the table this maps.
 */
import { getSupabase } from "@/lib/supabase";
import { resolveServiceId } from "@/lib/booking/recipe";

const TABLE = "Waitlist";

export type WaitlistStatus = "Waiting" | "Contacted" | "Booked" | "Cancelled";
export type WaitlistSource = "voice" | "chat" | "discord" | "admin";

export interface WaitlistEntry {
  id: string;
  clientId: string;
  clientName: string;
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

function mapRow(r: any): WaitlistEntry {
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
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

/**
 * Creates a new waitlist entry, unless an open (Waiting/Contacted) entry already exists for the
 * same client + treatment + preferred date — in which case that existing row is refreshed in
 * place instead of creating a duplicate. Mirrors the dedupe-before-insert pattern
 * findOpenCompletionByPhone already establishes for duplicate-pending-booking detection.
 */
export async function createWaitlistEntry(input: CreateWaitlistEntryInput): Promise<WaitlistEntry> {
  const sb = getSupabase();
  const serviceId = await resolveServiceId(sb, input.treatment).catch(() => null);

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
    return mapRow(data);
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
  return mapRow(data);
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
  return (data ?? []).map(mapRow);
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
