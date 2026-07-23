/**
 * Set-level operations over BookingCompletions — the reminder/expiry cron sweep, the staff
 * worklist query, and the duplicate-booking check. `completion-link.ts` owns a single token's
 * lifecycle; this file owns "the whole set of open links," mirroring how `retention/reminders.ts`
 * is its own module rather than living inside a generic client-lookup file.
 */
import { getSupabase } from "@/lib/supabase";
import { sendRetentionEmail } from "@/lib/integrations/email";
import { sendSms } from "@/lib/integrations/sms";
import { lookupClient } from "@/lib/integrations/airtable";
import { getAppBaseUrl } from "@/lib/client-channels";
import {
  mapCompletionRow,
  TABLE,
  type BookingCompletionRecord,
} from "@/lib/booking/completion-link";
import type { RetentionResult } from "@/types";

/** All bookings still waiting on a customer, or that timed out waiting — the Pending Bookings staff worklist. */
export async function listPendingCompletions(): Promise<BookingCompletionRecord[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .in("status", ["pending", "expired"])
    .order("expires_at", { ascending: true });
  if (error) throw new Error(`listPendingCompletions: ${error.message}`);
  return (data ?? []).map(mapCompletionRow);
}

/** The open (not yet completed, not yet expired) link for a phone number, if any — used to warn about a likely duplicate booking. */
export async function findOpenCompletionByPhone(
  phone: string,
): Promise<BookingCompletionRecord | null> {
  if (!phone?.trim()) return null;
  const sb = getSupabase();
  const { data } = await sb
    .from(TABLE)
    .select("*")
    .eq("phone", phone)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const record = mapCompletionRow(data);
  // mapCompletionRow already flips status to "expired" once past expires_at.
  return record.status === "pending" ? record : null;
}

/**
 * Cron sweep: sends one midpoint reminder to links that are halfway to expiry and haven't been
 * reminded yet, and flags links past their expiry window as `expired` (never cancels the
 * underlying calendar event — an unopened link is a staff decision, not an automatic cancellation).
 */
export async function runCompletionFollowupFlow(): Promise<RetentionResult> {
  const result: RetentionResult = { sent: 0, skipped: 0, failed: 0, details: [] };
  const sb = getSupabase();

  const { data, error } = await sb.from(TABLE).select("*").eq("status", "pending");
  if (error) throw new Error(`runCompletionFollowupFlow: ${error.message}`);

  const rows = (data ?? []).map(mapCompletionRow);
  const now = Date.now();

  for (const row of rows) {
    if (new Date(row.expiresAt).getTime() <= now) {
      const { error: updateError } = await sb
        .from(TABLE)
        .update({ status: "expired" })
        .eq("token", row.token);
      if (updateError) {
        result.failed++;
        result.details.push({
          clientId: row.token,
          clientName: row.clientName ?? undefined,
          status: "failed",
          reason: updateError.message,
        });
      } else {
        result.skipped++;
        result.details.push({
          clientId: row.token,
          clientName: row.clientName ?? undefined,
          status: "expired",
          reason: "past expiry window — flagged on Pending Bookings for staff follow-up",
        });
      }
      continue;
    }

    const createdMs = new Date(row.createdAt).getTime();
    const expiresMs = new Date(row.expiresAt).getTime();
    const midpoint = createdMs + (expiresMs - createdMs) / 2;

    if (row.remindedAt || now < midpoint) {
      result.skipped++;
      result.details.push({
        clientId: row.token,
        clientName: row.clientName ?? undefined,
        status: "skipped",
        reason: row.remindedAt ? "already reminded" : "before reminder midpoint",
      });
      continue;
    }

    try {
      const url = `${getAppBaseUrl()}/booking/complete/${row.token}`;
      const text = [
        `Hi${row.clientName ? ` ${row.clientName}` : ""}, just a reminder to finish setting up your Lumière appointment${row.treatment ? ` (${row.treatment})` : ""}.`,
        ``,
        `This link expires soon: ${url}`,
      ].join("\n");

      if (row.deliveryChannel === "email") {
        const client = await lookupClient({ phone: row.phone }).catch(() => null);
        if (!client?.email) throw new Error("no email on file for reminder");
        await sendRetentionEmail({
          to: client.email,
          subject: "Reminder: finish setting up your Lumière appointment",
          flowType: "booking",
          text,
          cta: { label: "Complete My Booking", url },
        });
      } else if (row.deliveryChannel === "sms") {
        const sms = await sendSms({ to: row.phone, body: text });
        if (!sms.sent) throw new Error(sms.error ?? "SMS send failed");
      }
      // "chat_reply" / "none": nothing to actively resend — just stop reprocessing this row.

      await sb.from(TABLE).update({ RemindedAt: new Date().toISOString() }).eq("token", row.token);
      result.sent++;
      result.details.push({
        clientId: row.token,
        clientName: row.clientName ?? undefined,
        status: "sent",
        contact: row.phone,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed++;
      result.details.push({
        clientId: row.token,
        clientName: row.clientName ?? undefined,
        status: "failed",
        reason: message,
      });
    }
  }

  return result;
}

export type { BookingCompletionRecord };
