/**
 * Per-booking, per-form completion tracking for in-house Forms/FormResponses — the single list
 * staff and the reminder cron read for "what's required for this booking." See
 * migrations/create_required_form_tracking.sql / migrations/remove_external_forms.sql: this app
 * only supports forms built inside it, never externally-hosted links.
 */
import { getSupabase } from "@/lib/supabase";
import type { InHouseFormLink } from "@/lib/booking/recipe";

const TABLE = "RequiredFormTracking";

export interface RequiredFormTrackingRecord {
  id: string;
  eventId: string;
  serviceId: string | null;
  clientId: string | null;
  source: "inhouse";
  formName: string;
  url: string;
  formResponseId: string | null;
  status: "PENDING" | "SUBMITTED" | "COMPLETED";
  sentAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
}

function mapRow(r: any): RequiredFormTrackingRecord {
  return {
    id: r.id,
    eventId: r.event_id,
    serviceId: r.service_id,
    clientId: r.client_id,
    source: r.form_source,
    formName: r.form_name,
    url: r.form_url,
    formResponseId: r.form_response_id,
    status: r.status,
    sentAt: r.sent_at,
    submittedAt: r.submitted_at,
    completedAt: r.completed_at,
  };
}

/**
 * Creates one PENDING tracking row per required in-house form for a booking that just had its
 * confirmation email sent. Never throws — the caller (confirmation-email.ts) guards this the same
 * way it already guards the link-resolution call, since tracking-row creation must never block
 * the confirmation email itself.
 */
export async function trackRequiredForms(opts: {
  eventId: string;
  serviceId: string | null;
  clientId: string | null;
  inHouseLinks: InHouseFormLink[];
}): Promise<void> {
  if (opts.inHouseLinks.length === 0) return;

  const rows = opts.inHouseLinks.map((l) => ({
    event_id: opts.eventId,
    service_id: opts.serviceId,
    client_id: opts.clientId,
    form_source: "inhouse" as const,
    form_name: l.formName,
    form_url: l.url,
    form_response_id: l.formResponseId,
    status: "PENDING" as const,
  }));

  const sb = getSupabase();
  const { error } = await sb.from(TABLE).insert(rows);
  if (error) throw new Error(`trackRequiredForms: ${error.message}`);
}

/** One batched query for many bookings' required-forms status, grouped by event_id — mirrors the
 * grouped-fetch pattern already used in src/app/api/settings/services/route.ts's GET handler. */
export async function listRequiredFormsForEvents(
  eventIds: string[],
): Promise<Map<string, RequiredFormTrackingRecord[]>> {
  const grouped = new Map<string, RequiredFormTrackingRecord[]>();
  if (eventIds.length === 0) return grouped;

  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select("*").in("event_id", eventIds);
  if (error || !data) return grouped;

  data.forEach((row: any) => {
    const record = mapRow(row);
    const existing = grouped.get(record.eventId) ?? [];
    existing.push(record);
    grouped.set(record.eventId, existing);
  });
  return grouped;
}

export async function listRequiredFormsForEvent(
  eventId: string,
): Promise<RequiredFormTrackingRecord[]> {
  const grouped = await listRequiredFormsForEvents([eventId]);
  return grouped.get(eventId) ?? [];
}

/** Single-row lookup by the tracking row's own id — backs the staff "Fill on Behalf" flow,
 * which needs to resolve a specific required form (and its form_response_id) before it can
 * load that form's fields or accept a submission for it. */
export async function getRequiredFormTrackingById(
  id: string,
): Promise<RequiredFormTrackingRecord | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}
