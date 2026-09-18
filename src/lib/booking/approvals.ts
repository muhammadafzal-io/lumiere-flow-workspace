import { getSupabase } from "@/lib/supabase";

/**
 * Head practitioner sign-off for bookings of services configured to require it.
 *
 * One row per booking, keyed by the calendar event id — the same shape as BookingCompletions and
 * RequiredFormTracking, since Google Calendar is this app's appointment store and there is no
 * appointments table to add a column to. The booking itself is always created normally: the slot,
 * room, practitioner, forms and confirmation are untouched, and this record is what marks it as
 * awaiting sign-off.
 */

const TABLE = "BookingApprovals";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface BookingApproval {
  id: string;
  eventId: string;
  serviceId: string | null;
  serviceName: string;
  status: ApprovalStatus;
  decidedByUserId: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  reason: string | null;
  /** The approver's handwritten signature as a PNG data URL — only ever set on an approval. */
  signature: string | null;
  createdAt: string;
}

/** Thrown when the migration hasn't been run yet, so callers can say so instead of a generic 500. */
export class BookingApprovalsUnavailableError extends Error {
  constructor() {
    super("Booking approvals aren't set up yet — run migrations/create_booking_approvals.sql.");
  }
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table|does not exist/i.test(error.message ?? "")
  );
}

function fail(op: string, error: { code?: string; message?: string }): never {
  if (isMissingTable(error)) throw new BookingApprovalsUnavailableError();
  throw new Error(`${op}: ${error.message}`);
}

function mapRow(row: any): BookingApproval {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    serviceId: row.service_id ?? null,
    serviceName: row.service_name ?? "",
    status: row.status as ApprovalStatus,
    decidedByUserId: row.decided_by_user_id ?? null,
    decidedByName: row.decided_by_name ?? null,
    decidedAt: row.decided_at ?? null,
    reason: row.reason ?? null,
    signature: row.signature ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Opens (or re-opens) sign-off for a booking. Called right after the calendar event is created,
 * and again if the booking later moves to a service that needs sign-off — re-opening resets an
 * earlier decision, because that decision was about a different treatment.
 *
 * Never throws: a failure here must not fail a booking that is already on the calendar, exactly
 * like the completion link and required-form tracking that run alongside it.
 */
export async function openBookingApproval(input: {
  eventId: string;
  serviceId: string | null;
  serviceName: string;
}): Promise<BookingApproval | null> {
  try {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .upsert(
        {
          event_id: input.eventId,
          service_id: input.serviceId,
          service_name: input.serviceName,
          status: "PENDING",
          decided_by_user_id: null,
          decided_by_name: null,
          decided_at: null,
          reason: null,
          signature: null,
        },
        { onConflict: "event_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  } catch (err) {
    console.error("[approvals] openBookingApproval failed:", err);
    return null;
  }
}

export async function listBookingApprovals(
  opts: { status?: ApprovalStatus; limit?: number } = {},
): Promise<BookingApproval[]> {
  let query = getSupabase()
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.status) query = query.eq("status", opts.status);

  const { data, error } = await query;
  if (error) fail("listBookingApprovals", error);
  return (data ?? []).map(mapRow);
}

export async function getBookingApproval(id: string): Promise<BookingApproval | null> {
  const { data, error } = await getSupabase().from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) fail("getBookingApproval", error);
  return data ? mapRow(data) : null;
}

export async function getApprovalsForEvents(
  eventIds: string[],
): Promise<Map<string, BookingApproval>> {
  const byEvent = new Map<string, BookingApproval>();
  if (eventIds.length === 0) return byEvent;

  const sb = getSupabase();
  // Chunked so a wide calendar range doesn't build an over-long request URL.
  for (let i = 0; i < eventIds.length; i += 100) {
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .in("event_id", eventIds.slice(i, i + 100));
    if (error) fail("getApprovalsForEvents", error);
    for (const row of data ?? []) {
      const approval = mapRow(row);
      byEvent.set(approval.eventId, approval);
    }
  }
  return byEvent;
}

export type DecisionOutcome =
  | { ok: true; approval: BookingApproval }
  | { ok: false; error: string; approval?: BookingApproval };

/**
 * Records a decision. The update is conditional on the row still being PENDING, so when two people
 * click at the same moment exactly one wins and the other is told what already happened — no
 * last-write-wins over someone else's sign-off.
 */
export async function decideBookingApproval(
  id: string,
  decision: "APPROVED" | "REJECTED",
  by: { userId: string; name: string },
  reason?: string,
  signature?: string,
): Promise<DecisionOutcome> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({
      status: decision,
      decided_by_user_id: by.userId,
      decided_by_name: by.name,
      decided_at: new Date().toISOString(),
      reason: reason?.trim() || null,
      // Only an approval carries a signature; a rejection is recorded with its reason.
      signature: decision === "APPROVED" ? (signature ?? null) : null,
    })
    .eq("id", id)
    .eq("status", "PENDING")
    .select("*")
    .maybeSingle();
  if (error) fail("decideBookingApproval", error);
  if (data) return { ok: true, approval: mapRow(data) };

  const current = await getBookingApproval(id);
  if (!current) return { ok: false, error: "This approval no longer exists." };
  if (current.status === decision) {
    // Someone already recorded the same decision — treat as done rather than an error.
    return { ok: true, approval: current };
  }
  return {
    ok: false,
    error: `This booking was already ${current.status.toLowerCase()}${
      current.decidedByName ? ` by ${current.decidedByName}` : ""
    }.`,
    approval: current,
  };
}

/** Closes a pending approval whose booking is gone, so a cancelled booking leaves the queue. */
export async function closeBookingApprovalForEvent(eventId: string): Promise<void> {
  try {
    await getSupabase()
      .from(TABLE)
      .update({ status: "CANCELLED", decided_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .eq("status", "PENDING");
  } catch (err) {
    console.error("[approvals] closeBookingApprovalForEvent failed:", err);
  }
}
