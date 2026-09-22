import type { Customer } from "@/lib/types";
import { getAppointmentHistoryForContact } from "@/lib/integrations/google-calendar";
import { listRequiredFormsForEvents } from "@/lib/forms/tracking";
import { getPhotoRequestsForEvents, photoUploadUrl } from "@/lib/booking/photos";
import { getApprovalsForEvents } from "@/lib/booking/approvals";
import { getSupabase } from "@/lib/supabase";
import { getAppBaseUrl } from "@/lib/client-channels";
import { groupPractitioners, groupTreatments } from "@/lib/customers/profile";
import { listActiveServices } from "@/lib/booking/recipe";
import { parseCreditCode } from "@/lib/integrations/airtable";
import { splitAppointmentField } from "@/lib/customers/visit-count";
import {
  customerActions,
  customerAppointmentStatus,
  toCustomerAppointment,
  type CustomerAppointment,
} from "@/lib/account/visible";

/**
 * Everything the portal reads, assembled from the systems that already own it — the calendar for
 * appointments, the existing per-booking tables for what's outstanding, and the same grouping
 * helpers the staff profile uses. No customer data is stored twice.
 */

export interface CustomerAppointments {
  upcoming: CustomerAppointment[];
  past: CustomerAppointment[];
}

/** Pending registration links, so a voice booking still missing details shows that action. */
async function pendingCompletionUrls(eventIds: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (eventIds.length === 0) return urls;
  const { data } = await getSupabase()
    .from("BookingCompletions")
    .select("event_id, token, status")
    .in("event_id", eventIds.slice(0, 200))
    .eq("status", "pending");
  for (const row of data ?? []) {
    urls.set(String(row.event_id), `${getAppBaseUrl()}/booking/complete/${row.token}`);
  }
  return urls;
}

export async function getCustomerAppointments(
  customer: Customer,
  now = Date.now(),
): Promise<CustomerAppointments> {
  const history = await getAppointmentHistoryForContact({
    id: customer.id,
    phone: customer.phone,
    name: customer.name,
  });

  const events = [...history.upcoming, ...history.past];
  const eventIds = events.map((e) => e.id);

  const [forms, photos, approvals, completions] = await Promise.all([
    listRequiredFormsForEvents(eventIds).catch(() => new Map()),
    getPhotoRequestsForEvents(eventIds).catch(() => new Map()),
    getApprovalsForEvents(eventIds).catch(() => new Map()),
    pendingCompletionUrls(eventIds).catch(() => new Map<string, string>()),
  ]);

  const shape = (list: typeof history.upcoming) =>
    list.map((event) => {
      const eventForms = (forms.get(event.id) ?? []).map((f: any) => ({
        id: f.id,
        formName: f.formName,
        url: f.url,
        source: f.source,
        status: f.status,
        sentAt: f.sentAt,
        submittedAt: f.submittedAt,
        completedAt: f.completedAt,
      }));
      const photo = photos.get(event.id);
      const approval = approvals.get(event.id);
      const completionUrl = completions.get(event.id) ?? null;

      return toCustomerAppointment(event, {
        status: customerAppointmentStatus(
          event,
          {
            awaitingDetails: !!completionUrl,
            awaitingApproval: approval?.status === "PENDING",
          },
          now,
        ),
        actions: customerActions({
          forms: eventForms,
          photo: photo
            ? {
                requirement: photo.request.requirement,
                status: photo.request.status,
                url: photoUploadUrl(photo.request.token),
              }
            : null,
          completionUrl,
        }),
      });
    });

  return { upcoming: shape(history.upcoming), past: shape(history.past) };
}

export interface CustomerHistory {
  treatments: { name: string; visitCount: number; lastDate: string | null }[];
  practitioners: { name: string; visitCount: number; lastDate: string | null }[];
  totalVisits: number;
  firstVisit: string | null;
}

export async function getCustomerHistory(customer: Customer): Promise<CustomerHistory> {
  const history = await getAppointmentHistoryForContact({
    id: customer.id,
    phone: customer.phone,
    name: customer.name,
  });

  const treatments = groupTreatments(history, []).filter((t) => t.visitCount > 0);
  const practitioners = groupPractitioners(history);
  const oldest = history.past[history.past.length - 1];

  return {
    treatments: treatments.map(({ name, visitCount, lastDate }) => ({
      name,
      visitCount,
      lastDate,
    })),
    practitioners,
    totalVisits: history.past.length || splitAppointmentField(customer.appointments).length,
    firstVisit: oldest?.startTime ?? null,
  };
}

export interface CustomerOffer {
  id: string;
  name: string;
  detail: string;
  code: string | null;
  serviceName: string | null;
}

/**
 * What this client can actually use: the clinic's currently active service offers, plus any credit
 * codes issued to them. Pricing is never recalculated here — an offer's own configuration decides
 * that when it is applied at booking.
 */
export async function getCustomerOffers(customer: Customer): Promise<CustomerOffer[]> {
  const offers: CustomerOffer[] = [];
  const sb = getSupabase();

  const services = await listActiveServices().catch(() => []);
  const serviceNames = new Map(services.map((s) => [s.id, s.name]));

  const { data: serviceOffers } = await sb
    .from("ServiceOffers")
    .select("id, service_id, name, discount_type, discount_value, enabled, starts_at, ends_at");

  const today = new Date().toISOString().slice(0, 10);
  for (const row of serviceOffers ?? []) {
    if (row.enabled === false) continue;
    if (row.starts_at && String(row.starts_at).slice(0, 10) > today) continue;
    if (row.ends_at && String(row.ends_at).slice(0, 10) < today) continue;
    const serviceName = serviceNames.get(row.service_id) ?? null;
    // Only offers on treatments the client can actually book online.
    if (!serviceName) continue;

    offers.push({
      id: String(row.id),
      name: row.name ?? "Offer",
      detail:
        // Both spellings appear in the data ("percent" and "percentage") — matching only one is
        // what made a 50%-off offer read as "$50 off" here while the landing page got it right.
        row.discount_type === "percent" || row.discount_type === "percentage"
          ? `${row.discount_value}% off ${serviceName}`
          : `$${row.discount_value} off ${serviceName}`,
      code: null,
      serviceName,
    });
  }

  // Personal credit codes live on the client's own record (birthday gifts, campaign rewards),
  // packed as "CODE|expiry" and optionally "USED:" prefixed — parseCreditCode already knows that
  // shape (it's what validate_credit_code checks against at booking), so it's reused here rather
  // than re-parsed. Read straight from the row: the admin-facing Customer shape doesn't carry it.
  const { data: codeRow } = await sb
    .from("Clients")
    .select('"Credit Codes"')
    .eq("id", customer.id)
    .maybeSingle();
  const rawCodes = (codeRow as { "Credit Codes"?: string } | null)?.["Credit Codes"];
  for (const raw of splitCodes(rawCodes)) {
    const info = parseCreditCode(raw);
    // A used or expired code is nothing the client can actually redeem — showing it would send
    // them into booking with a code that then fails.
    if (!info.isValid) continue;
    offers.push({
      id: `code-${info.code}`,
      name: "Your credit code",
      detail: info.expiresAt
        ? `$${info.creditAmount} credit, expires ${formatExpiry(info.expiresAt)}`
        : `$${info.creditAmount} credit`,
      code: info.code,
      serviceName: null,
    });
  }

  return offers;
}

function splitCodes(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
