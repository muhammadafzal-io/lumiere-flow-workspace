import type { Customer } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";
import { getCustomerAppointments } from "@/lib/account/data";
import { listRequiredFormsForEvents } from "@/lib/forms/tracking";
import { readActivityLogForClient } from "@/lib/integrations/activity-log";
import { listSharedClientNotes } from "@/lib/customers/notes";

/**
 * Everything that has happened between this client and the clinic, in one list, newest first.
 *
 * Only things that are genuinely the client's own: their visits, the forms they were sent or
 * completed, the emails actually delivered to them, cancellations and reschedules, and the
 * practitioner notes a staff member explicitly chose to share. Internal activity (errors, system
 * jobs, unshared staff notes, failed or simulated sends) is never included. Each source is fetched
 * independently and a failing one is simply left out — one broken table must not blank the page.
 */

export type TimelineKind = "visit" | "form" | "email" | "note" | "change";

export interface TimelineItem {
  id: string;
  at: string;
  kind: TimelineKind;
  title: string;
  detail: string | null;
  /** Optional second line — e.g. who the visit was with. */
  meta: string | null;
  /** Visits only: "upcoming" | "past" — lets the UI mark what's still ahead. */
  when?: "upcoming" | "past";
}

export interface SharedNote {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  /** "Botox — 4 Sept" when the note was written from a specific visit. */
  fromVisit: string | null;
}

export interface CustomerTimeline {
  items: TimelineItem[];
  practitionerNotes: SharedNote[];
}

const EMAIL_LABELS: Record<string, string> = {
  booking: "Booking confirmation",
  reminder: "Appointment reminder",
  cancellation: "Cancellation confirmation",
  reschedule: "Reschedule confirmation",
  birthday: "Birthday message",
  campaign: "Message from the clinic",
  rule: "Message from the clinic",
  reactivation: "Message from the clinic",
  noshow: "Message from the clinic",
  general: "Message from the clinic",
};

const clean = (s: string | null | undefined, max = 220) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

async function safe<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error(`[account/timeline] ${label} failed:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

export async function getCustomerTimeline(customer: Customer): Promise<CustomerTimeline> {
  const [appointments, sharedNotes, emails, activity] = await Promise.all([
    safe("appointments", () => getCustomerAppointments(customer), { upcoming: [], past: [] }),
    safe("notes", () => listSharedClientNotes(customer.id), []),
    safe("emails", () => fetchEmails(customer), []),
    safe(
      "activity",
      () => readActivityLogForClient(customer.id, { phone: customer.phone || undefined }),
      [],
    ),
  ]);

  const visits = [...appointments.upcoming, ...appointments.past];
  const eventLabel = new Map(
    visits.map((a) => [
      a.id,
      `${a.treatment} — ${new Date(a.startTime).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`,
    ]),
  );
  const forms = await safe(
    "forms",
    () => listRequiredFormsForEvents(visits.map((v) => v.id)),
    new Map(),
  );

  const items: TimelineItem[] = [];

  for (const [list, when] of [
    [appointments.upcoming, "upcoming"],
    [appointments.past, "past"],
  ] as const) {
    for (const a of list) {
      items.push({
        id: `visit-${a.id}`,
        at: a.startTime,
        kind: "visit",
        title: a.treatment,
        detail: a.notes ? `Your note: ${clean(a.notes)}` : null,
        meta:
          [a.practitioner ? `with ${a.practitioner}` : null, a.room].filter(Boolean).join(" · ") ||
          null,
        when,
      });
    }
  }

  for (const [eventId, records] of forms) {
    const visit = eventLabel.get(eventId);
    for (const f of records) {
      const done = f.completedAt ?? f.submittedAt;
      if (f.sentAt) {
        items.push({
          id: `form-sent-${f.id}`,
          at: f.sentAt,
          kind: "form",
          title: `Form sent — ${f.formName}`,
          detail: visit ? `For ${visit}` : null,
          meta: null,
        });
      }
      if (done) {
        items.push({
          id: `form-done-${f.id}`,
          at: done,
          kind: "form",
          title: `Form completed — ${f.formName}`,
          detail: visit ? `For ${visit}` : null,
          meta: null,
        });
      }
    }
  }

  for (const e of emails) {
    items.push({
      id: `email-${e.id}`,
      at: e.at,
      kind: "email",
      title: e.subject || EMAIL_LABELS[e.category] || "Message from the clinic",
      detail: e.preview ? clean(e.preview) : null,
      meta: EMAIL_LABELS[e.category] ?? null,
    });
  }

  for (const a of activity) {
    if (a.status !== "success") continue;
    if (a.eventType !== "cancellation" && a.eventType !== "reschedule") continue;
    // The "…email sent to x" rows describe the email, which is already listed above.
    if (/email sent/i.test(a.details)) continue;
    items.push({
      id: `activity-${a.id}`,
      at: a.timestamp,
      kind: "change",
      title: a.eventType === "cancellation" ? "Appointment cancelled" : "Appointment rescheduled",
      detail: clean(a.details.replace(/ from the customer portal$/i, "")),
      meta: null,
    });
  }

  const practitionerNotes: SharedNote[] = sharedNotes.map((n) => ({
    id: n.id,
    body: n.body,
    authorName: n.authorName,
    createdAt: n.createdAt,
    fromVisit: n.eventId ? (eventLabel.get(n.eventId) ?? null) : null,
  }));
  for (const n of practitionerNotes) {
    items.push({
      id: `note-${n.id}`,
      at: n.createdAt,
      kind: "note",
      title: `Note from ${n.authorName}`,
      detail: clean(n.body, 300),
      meta: n.fromVisit,
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return { items: items.slice(0, 300), practitionerNotes };
}

async function fetchEmails(customer: Customer) {
  const sb = getSupabase();
  const filters = [`client_id.eq.${customer.id}`];
  // Strip characters that would break the PostgREST or() expression; emails never need them.
  const email = customer.email?.trim().replace(/[,()*]/g, "");
  if (email) filters.push(`to_email.ilike.${email}`);
  const { data, error } = await sb
    .from("email_sends")
    .select("id, created_at, category, subject, message_preview, status, simulated")
    .or(filters.join(","))
    .eq("status", "sent")
    .eq("simulated", false)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    at: String(r.created_at),
    category: String(r.category ?? "general"),
    subject: (r.subject as string | null) ?? "",
    preview: (r.message_preview as string | null) ?? "",
  }));
}
