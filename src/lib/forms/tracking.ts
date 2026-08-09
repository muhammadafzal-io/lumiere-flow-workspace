/**
 * Unified, per-booking, per-form completion tracking — sits on top of both of this app's form
 * systems (ServiceFormLinks external URLs, and Forms/FormResponses in-house forms) without
 * merging or refactoring either. See migrations/create_required_form_tracking.sql for why a
 * single table is needed: neither source system carries "list everything required for booking
 * X" state on its own.
 */
import { getSupabase } from "@/lib/supabase";
import type { ServiceFormLink, InHouseFormLink } from "@/lib/booking/recipe";

const TABLE = "RequiredFormTracking";

export interface RequiredFormTrackingRecord {
  id: string;
  eventId: string;
  serviceId: string | null;
  source: "external" | "inhouse";
  formName: string;
  url: string;
  status: "PENDING" | "COMPLETED";
  sentAt: string | null;
  completedAt: string | null;
}

function mapRow(r: any): RequiredFormTrackingRecord {
  return {
    id: r.id,
    eventId: r.event_id,
    serviceId: r.service_id,
    source: r.form_source,
    formName: r.form_name,
    url: r.form_url,
    status: r.status,
    sentAt: r.sent_at,
    completedAt: r.completed_at,
  };
}

/**
 * Creates one PENDING tracking row per required form (both external and in-house) for a booking
 * that just had its confirmation email sent. Never throws — the caller (confirmation-email.ts)
 * guards this the same way it already guards the two link-resolution calls, since tracking-row
 * creation must never block the confirmation email itself.
 */
export async function trackRequiredForms(opts: {
  eventId: string;
  serviceId: string | null;
  externalLinks: ServiceFormLink[];
  inHouseLinks: InHouseFormLink[];
}): Promise<void> {
  if (opts.externalLinks.length === 0 && opts.inHouseLinks.length === 0) return;

  const rows = [
    ...opts.externalLinks.map((l) => ({
      event_id: opts.eventId,
      service_id: opts.serviceId,
      form_source: "external" as const,
      form_name: l.label,
      form_url: l.url,
      service_form_link_id: l.id,
      form_response_id: null,
      status: "PENDING" as const,
    })),
    ...opts.inHouseLinks.map((l) => ({
      event_id: opts.eventId,
      service_id: opts.serviceId,
      form_source: "inhouse" as const,
      form_name: l.formName,
      form_url: l.url,
      service_form_link_id: null,
      form_response_id: l.formResponseId,
      status: "PENDING" as const,
    })),
  ];

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
