/**
 * Secure, single-use "fill out this form" link, sent to the client via the booking confirmation
 * email for every in-house Form attached to the service they booked. Mirrors
 * src/lib/booking/completion-link.ts's token/expiry/status shape exactly — deliberately a
 * separate, independent copy rather than a shared refactor, since the two systems (booking
 * completion vs. form submission) have different lifecycles.
 */
import crypto from "crypto";
import { getSupabase } from "@/lib/supabase";
import { getAppBaseUrl } from "@/lib/client-channels";
import type { FormField } from "@/lib/forms/types";
import { validateFormAnswers } from "@/lib/forms/validate";
import { listRequiredFormsForEvent, type RequiredFormTrackingRecord } from "@/lib/forms/tracking";

/** Grace period always ends at least this long before the appointment itself, never after. */
const LEAD_BUFFER_MS = 60 * 60_000;
const MIN_WINDOW_MS = 30 * 60_000;
const MAX_WINDOW_MS = 24 * 60 * 60_000;
export const TABLE = "FormResponses";

export interface FormResponseRecord {
  id: string;
  token: string;
  formId: string;
  serviceId: string;
  eventId: string;
  phone: string;
  clientName: string | null;
  clientId: string | null;
  status: "pending" | "completed" | "expired";
  expiresAt: string;
  createdAt: string;
}

function mapFormResponseRow(r: any): FormResponseRecord {
  const expired = r.status === "pending" && new Date(r.expires_at).getTime() < Date.now();
  return {
    id: r.id,
    token: r.token,
    formId: r.form_id,
    serviceId: r.service_id,
    eventId: r.event_id,
    phone: r.phone,
    clientName: r.client_name,
    clientId: r.client_id,
    status: expired ? "expired" : r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  };
}

/** Never outlives the appointment: ends 1h before it, capped to [30min, 24h] from now. Same
 * clamp logic as completion-link.ts's computeExpiry — intentionally duplicated, not shared. */
function computeFormResponseExpiry(appointmentStartIso: string): string {
  const now = Date.now();
  const untilAppointment = new Date(appointmentStartIso).getTime() - now - LEAD_BUFFER_MS;
  const windowMs = Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, untilAppointment));
  return new Date(now + windowMs).toISOString();
}

export async function createFormResponseLink(opts: {
  formId: string;
  serviceId: string;
  eventId: string;
  phone: string;
  clientName?: string;
  clientId?: string | null;
  appointmentStartTime: string;
}): Promise<{ id: string; token: string; url: string }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = computeFormResponseExpiry(opts.appointmentStartTime);

  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      token,
      form_id: opts.formId,
      service_id: opts.serviceId,
      event_id: opts.eventId,
      phone: opts.phone,
      client_name: opts.clientName ?? null,
      client_id: opts.clientId ?? null,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createFormResponseLink: ${error.message}`);

  return { id: data.id, token, url: `${getAppBaseUrl()}/forms/fill/${token}` };
}

/** Loads the link + its parent Form. Unlike getCompletionLink, does NOT depend on the calendar
 * event still existing — nothing here patches the event, so a cancelled/rescheduled booking
 * doesn't invalidate an already-issued form link. */
export async function getFormResponseLink(token: string): Promise<{
  link: FormResponseRecord;
  form: { id: string; name: string; description: string; fields: FormField[] };
} | null> {
  const sb = getSupabase();
  const { data } = await sb.from(TABLE).select("*").eq("token", token).maybeSingle();
  if (!data) return null;
  const link = mapFormResponseRow(data);

  const { data: formRow } = await sb.from("Forms").select("*").eq("id", link.formId).maybeSingle();
  if (!formRow) return null; // parent Form was deleted — nothing to render

  return {
    link,
    form: {
      id: formRow.id,
      name: formRow.name ?? "",
      description: formRow.description ?? "",
      fields: Array.isArray(formRow.fields) ? formRow.fields : [],
    },
  };
}

/** Same as getFormResponseLink, but keyed by the FormResponses row's own id instead of its
 * token — kept as its own named function rather than a dual-mode overload, so each call site's
 * intent stays unambiguous. Backs the staff "Fill on Behalf" flow, which has no token: staff
 * reach a form via its RequiredFormTracking.form_response_id, not an emailed link. */
export async function getFormResponseLinkById(id: string): Promise<{
  link: FormResponseRecord;
  form: { id: string; name: string; description: string; fields: FormField[] };
} | null> {
  const sb = getSupabase();
  const { data } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const link = mapFormResponseRow(data);

  const { data: formRow } = await sb.from("Forms").select("*").eq("id", link.formId).maybeSingle();
  if (!formRow) return null;

  return {
    link,
    form: {
      id: formRow.id,
      name: formRow.name ?? "",
      description: formRow.description ?? "",
      fields: Array.isArray(formRow.fields) ? formRow.fields : [],
    },
  };
}

export interface FormResponseAnswers {
  formName: string;
  fields: FormField[];
  answers: Record<string, unknown>;
  submittedAt: string | null;
  /** Set only when a staff member entered this response on the client's behalf (see
   * submitFormResponseForStaff) — lets the read-only "View Response" dialog tell that apart
   * from a client's own submission. */
  enteredByStaffName: string | null;
  /** Set only once a staff member has edited the originally-submitted answers (see
   * updateFormResponseAnswers) — kept separate from enteredByStaffName so "who typed this in
   * originally" and "who last changed it" stay distinguishable. */
  editedByStaffName: string | null;
  editedAt: string | null;
}

/** Staff-facing read of a single response's submitted answers, keyed by FormResponses.id (not
 * token, which is the client-facing single-use credential) — backs the admin "View Response"
 * action. Returns null if the response isn't actually completed yet, or if the response or its
 * parent Form no longer exists. */
export async function getFormResponseAnswers(
  formResponseId: string,
): Promise<FormResponseAnswers | null> {
  const sb = getSupabase();
  const { data } = await sb.from(TABLE).select("*").eq("id", formResponseId).maybeSingle();
  if (!data || data.status !== "completed") return null;

  const { data: formRow } = await sb.from("Forms").select("*").eq("id", data.form_id).maybeSingle();
  if (!formRow) return null;

  return {
    formName: formRow.name ?? "",
    fields: Array.isArray(formRow.fields) ? formRow.fields : [],
    answers: data.answers ?? {},
    submittedAt: data.consumed_at ?? null,
    enteredByStaffName: data.entered_by_staff_name ?? null,
    editedByStaffName: data.edited_by_staff_name ?? null,
    editedAt: data.edited_at ?? null,
  };
}

/**
 * Lets staff correct an already-submitted response's answers (typo, missed detail) instead of
 * the record being permanently locked once submitted. Deliberately does NOT touch `status`,
 * `consumed_at`, or the RequiredFormTracking row — editing content is orthogonal to the
 * PENDING/SUBMITTED/COMPLETED review lifecycle, which stays exactly where it was. Records who
 * edited it and when, so the original submission's provenance isn't silently lost.
 */
export async function updateFormResponseAnswers(
  formResponseId: string,
  answers: Record<string, unknown>,
  staff: { id: string; name: string },
): Promise<SubmitFormResult> {
  const sb = getSupabase();
  const { data } = await sb.from(TABLE).select("*").eq("id", formResponseId).maybeSingle();
  if (!data || data.status !== "completed") {
    return { ok: false, error: "This form hasn't been submitted yet." };
  }

  const { data: formRow } = await sb.from("Forms").select("*").eq("id", data.form_id).maybeSingle();
  const fields: FormField[] = Array.isArray(formRow?.fields) ? formRow.fields : [];

  const errors = validateFormAnswers(fields, answers);
  if (errors) return { ok: false, error: "Please fix the highlighted fields.", errors };

  const { error } = await sb
    .from(TABLE)
    .update({
      answers,
      edited_by_staff_id: staff.id,
      edited_by_staff_name: staff.name,
      edited_at: new Date().toISOString(),
    })
    .eq("id", formResponseId);
  if (error) {
    return { ok: false, error: "Something went wrong saving these changes. Please try again." };
  }

  return { ok: true };
}

export type SubmitFormResult =
  | { ok: true }
  | { ok: false; error: string; errors?: Record<string, string> };

/** Best-effort — keeps the unified staff-facing tracking row in sync, but never lets a failure
 * here affect the client's actual submission, which has already succeeded by the time this
 * runs. Deliberately SUBMITTED, not COMPLETED — a submission (by a client or by staff on their
 * behalf) is not the same as staff having reviewed and approved it; only the dedicated "mark
 * complete" action ever writes COMPLETED. Shared by submitFormResponse and
 * submitFormResponseForStaff, since both need this exact same sync. */
async function syncTrackingToSubmitted(formResponseId: string): Promise<void> {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("RequiredFormTracking")
      .update({ status: "SUBMITTED", submitted_at: new Date().toISOString() })
      .eq("form_response_id", formResponseId);
    if (error) {
      console.error("[syncTrackingToSubmitted] tracking update failed:", error.message);
    }
  } catch (err) {
    console.error("[syncTrackingToSubmitted] tracking update failed:", err);
  }
}

export async function submitFormResponse(
  token: string,
  answers: Record<string, unknown>,
): Promise<SubmitFormResult> {
  const found = await getFormResponseLink(token);
  if (!found) return { ok: false, error: "This link is invalid." };
  const { link, form } = found;

  if (link.status === "completed") {
    return { ok: false, error: "This form has already been submitted." };
  }
  if (link.status === "expired") {
    return { ok: false, error: "This link has expired. Please contact the clinic directly." };
  }

  const errors = validateFormAnswers(form.fields, answers);
  if (errors) return { ok: false, error: "Please fix the highlighted fields.", errors };

  const sb = getSupabase();
  const { error } = await sb
    .from(TABLE)
    .update({ answers, status: "completed", consumed_at: new Date().toISOString() })
    .eq("token", token);
  if (error) {
    return { ok: false, error: "Something went wrong saving your answers. Please try again." };
  }

  await syncTrackingToSubmitted(link.id);

  return { ok: true };
}

/**
 * Staff-only counterpart to submitFormResponse: lets a staff member enter a client's answers
 * themselves (e.g. the client filled the form out on paper in person) instead of leaving it
 * PENDING forever with no supported path forward — the only other way to write a submission is
 * the client's own emailed token link. Keyed by the FormResponses row's id (reached via its
 * RequiredFormTracking row), not a token, since staff have none.
 *
 * Deliberately does NOT block on link.status === "expired" — bypassing the client-facing expiry
 * window is the entire point of this fallback. Still blocks on "completed", so this can't
 * double-submit over an existing response.
 */
export async function submitFormResponseForStaff(
  formResponseId: string,
  answers: Record<string, unknown>,
  staff: { id: string; name: string },
): Promise<SubmitFormResult> {
  const found = await getFormResponseLinkById(formResponseId);
  if (!found) return { ok: false, error: "This form could not be found." };
  const { link, form } = found;

  if (link.status === "completed") {
    return { ok: false, error: "This form has already been submitted." };
  }

  const errors = validateFormAnswers(form.fields, answers);
  if (errors) return { ok: false, error: "Please fix the highlighted fields.", errors };

  const sb = getSupabase();
  const { error } = await sb
    .from(TABLE)
    .update({
      answers,
      status: "completed",
      consumed_at: new Date().toISOString(),
      entered_by_staff_id: staff.id,
      entered_by_staff_name: staff.name,
    })
    .eq("id", formResponseId);
  if (error) {
    return { ok: false, error: "Something went wrong saving these answers. Please try again." };
  }

  await syncTrackingToSubmitted(link.id);

  return { ok: true };
}

export interface BookingFormsDashboard {
  link: FormResponseRecord;
  form: { id: string; name: string; description: string; fields: FormField[] };
  /** Populated only once this specific link has actually been submitted. */
  answers: Record<string, unknown> | null;
  submittedAt: string | null;
  /** Every required form for the same booking (event_id), including this one — the page matches
   * the "current" row by `formResponseId === link.id` to render it inline vs. as a sibling link. */
  requiredForms: RequiredFormTrackingRecord[];
}

/**
 * Powers the customer-facing "dashboard" at /forms/fill/[token] — the same emailed link now shows
 * every required form for the whole booking, not just the one it was originally sent for. Reuses
 * getFormResponseLink and listRequiredFormsForEvent (both already established, unchanged) rather
 * than introducing any new token or table.
 */
export async function getBookingFormsDashboard(
  token: string,
): Promise<BookingFormsDashboard | null> {
  const found = await getFormResponseLink(token);
  if (!found) return null;
  const { link, form } = found;

  const [answers, requiredForms] = await Promise.all([
    link.status === "completed" ? getFormResponseAnswers(link.id) : Promise.resolve(null),
    listRequiredFormsForEvent(link.eventId),
  ]);

  return {
    link,
    form,
    answers: answers?.answers ?? null,
    submittedAt: answers?.submittedAt ?? null,
    requiredForms,
  };
}
