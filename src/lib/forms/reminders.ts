/**
 * Form-completion reminder cron — deliberately separate from src/lib/retention/reminders.ts (zero
 * cross-references between src/lib/retention/ and src/lib/forms/, and this doesn't touch the
 * existing multi-channel WhatsApp/Discord retention pipeline). Mirrors the structure of
 * src/lib/booking/completion-followups.ts's runCompletionFollowupFlow: one query, grouped by
 * booking, per-booking send with a dedup guard column.
 */
import { getSupabase } from "@/lib/supabase";
import { sendRetentionEmail } from "@/lib/integrations/email";
import { getCalendarBookingDetails } from "@/lib/integrations/google-calendar";
import type { RetentionResult } from "@/types";
import { isWithinFormReminderWindow } from "@/lib/forms/reminder-window";

const TABLE = "RequiredFormTracking";

interface PendingRow {
  id: string;
  eventId: string;
  formName: string;
  formUrl: string;
}

function hoursUntil(isoTime: string): number {
  return (new Date(isoTime).getTime() - Date.now()) / (1000 * 60 * 60);
}

/**
 * Checks every booking with outstanding (PENDING, not yet reminded) required forms and sends one
 * reminder email per booking listing only its still-pending forms — never sent if every required
 * form for that booking is already completed, since completed forms are excluded from the query
 * itself (nothing to list means nothing to remind about).
 */
export async function runFormReminderFlow(): Promise<RetentionResult> {
  const result: RetentionResult = { sent: 0, skipped: 0, failed: 0, details: [] };
  const sb = getSupabase();

  const { data, error } = await sb
    .from(TABLE)
    .select("id, event_id, form_name, form_url")
    .eq("status", "PENDING")
    .is("reminder_sent_at", null);
  if (error) throw new Error(`runFormReminderFlow: ${error.message}`);

  const grouped = new Map<string, PendingRow[]>();
  for (const r of data ?? []) {
    const row: PendingRow = {
      id: r.id,
      eventId: r.event_id,
      formName: r.form_name,
      formUrl: r.form_url,
    };
    const existing = grouped.get(row.eventId) ?? [];
    existing.push(row);
    grouped.set(row.eventId, existing);
  }

  for (const [eventId, rows] of grouped) {
    const booking = await getCalendarBookingDetails(eventId).catch(() => null);
    if (!booking) {
      result.skipped++;
      result.details.push({ clientId: eventId, status: "skipped", reason: "booking not found" });
      continue;
    }

    const hours = hoursUntil(booking.startTime);
    if (!isWithinFormReminderWindow(hours)) {
      result.skipped++;
      result.details.push({
        clientId: eventId,
        clientName: booking.clientName,
        status: "skipped",
        reason: "outside reminder window",
      });
      continue;
    }

    if (!booking.clientEmail) {
      result.skipped++;
      result.details.push({
        clientId: eventId,
        clientName: booking.clientName,
        status: "skipped",
        reason: "no email on file",
      });
      continue;
    }

    try {
      const text = [
        `Hi ${booking.clientName}, you have ${rows.length > 1 ? "forms" : "a form"} still to complete before your ${booking.treatment} appointment.`,
        ``,
        `Please complete the following before your visit:`,
        ...rows.map((r) => `${r.formName}: ${r.formUrl}`),
      ].join("\n");

      const outcome = await sendRetentionEmail({
        to: booking.clientEmail,
        subject: `Action needed: complete your forms before your ${booking.treatment} appointment`,
        flowType: "reminder",
        logMeta: {
          category: "reminder",
          triggerType: "cron",
          clientName: booking.clientName,
        },
        text,
      });
      if (!outcome.sent) throw new Error(outcome.error ?? "send failed");

      const { error: updateError } = await sb
        .from(TABLE)
        .update({ reminder_sent_at: new Date().toISOString() })
        .in(
          "id",
          rows.map((r) => r.id),
        );
      if (updateError) throw new Error(updateError.message);

      result.sent++;
      result.details.push({
        clientId: eventId,
        clientName: booking.clientName,
        status: "success",
        emailAddress: booking.clientEmail,
        emailSent: true,
      });
    } catch (err) {
      result.failed++;
      result.details.push({
        clientId: eventId,
        clientName: booking.clientName,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
