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

/** Grace period always ends at least this long before the appointment itself, never after. */
const LEAD_BUFFER_MS = 60 * 60_000;
const MIN_WINDOW_MS = 30 * 60_000;
const MAX_WINDOW_MS = 24 * 60 * 60_000;
export const TABLE = "FormResponses";

export interface FormResponseRecord {
  token: string;
  formId: string;
  serviceId: string;
  eventId: string;
  phone: string;
  clientName: string | null;
  status: "pending" | "completed" | "expired";
  expiresAt: string;
  createdAt: string;
}

function mapFormResponseRow(r: any): FormResponseRecord {
  const expired = r.status === "pending" && new Date(r.expires_at).getTime() < Date.now();
  return {
    token: r.token,
    formId: r.form_id,
    serviceId: r.service_id,
    eventId: r.event_id,
    phone: r.phone,
    clientName: r.client_name,
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
  appointmentStartTime: string;
}): Promise<{ token: string; url: string }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = computeFormResponseExpiry(opts.appointmentStartTime);

  const sb = getSupabase();
  const { error } = await sb.from(TABLE).insert({
    token,
    form_id: opts.formId,
    service_id: opts.serviceId,
    event_id: opts.eventId,
    phone: opts.phone,
    client_name: opts.clientName ?? null,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`createFormResponseLink: ${error.message}`);

  return { token, url: `${getAppBaseUrl()}/forms/fill/${token}` };
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

export type SubmitFormResult =
  | { ok: true }
  | { ok: false; error: string; errors?: Record<string, string> };

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

  return { ok: true };
}
