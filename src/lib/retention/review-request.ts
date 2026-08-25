import { getSupabase } from "@/lib/supabase";
import { getClinicConfig } from "@/lib/clinic-config";
import { logEvent } from "@/lib/integrations/activity-log";
import { lookupClientByPhone } from "@/lib/integrations/airtable";
import { getMessagingProvider } from "@/lib/messaging";
import { readFollowupSendsForClient } from "@/lib/retention/followup-sends";
import { trySend } from "@/lib/retention/utils";
import { classifyFollowupResponse, type FollowupSentiment } from "@/lib/retention/sentiment";
import { decideReviewRequestOutcome } from "@/lib/retention/review-decision";

const TABLE = "ReviewRequests";

const DEFAULT_REVIEW_REQUEST_MESSAGE = `Hi {first_name},

We're so glad you had a great experience with Lumière! If you have a moment, we'd really appreciate you sharing it on Google — it helps other clients find us.

{review_url}

Thank you so much!
The Lumière Team`;

function personalizeReviewMessage(template: string, name: string, reviewUrl: string): string {
  const first = name.trim().split(/\s+/)[0] || name;
  return template.replace(/\{first_name\}/g, first).replace(/\{review_url\}/g, reviewUrl);
}

export interface ReviewRequestOutcome {
  status: "SENT" | "FAILED" | "SKIPPED" | "NO_MATCH";
  reason?: string;
  sentiment?: FollowupSentiment;
}

async function logReviewRequest(row: {
  appointmentId: string;
  clientId?: string;
  clientName: string;
  phone: string;
  email?: string;
  feedbackText: string;
  sentiment: FollowupSentiment;
  status: "SENT" | "FAILED" | "SKIPPED";
  skipReason?: string;
  googleReviewUrl: string | null;
  platform: string;
}): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).insert({
    appointment_id: row.appointmentId,
    client_id: row.clientId ?? null,
    client_name: row.clientName,
    client_contact: row.phone,
    client_email: row.email ?? null,
    trigger_response: row.feedbackText,
    sentiment: row.sentiment,
    status: row.status,
    skip_reason: row.skipReason ?? null,
    google_review_url: row.googleReviewUrl,
    platform: row.platform,
    sent_at: row.status === "SENT" ? new Date().toISOString() : null,
  });
  if (error) console.error("[review-request] failed to log ReviewRequests row:", error.message);

  await logEvent(
    "review-request",
    row.clientName,
    row.status === "SENT"
      ? `Google Review request sent${row.email ? ` — ${row.email}` : ""}`
      : `Google Review request ${row.status.toLowerCase()}${row.skipReason ? ` (${row.skipReason})` : ""}`,
    { clientId: row.clientId, phone: row.phone, email: row.email, platform: row.platform },
  ).catch(() => undefined);
}

/**
 * Entry point: given a customer's freeform message and phone number (as resolved by the AI agent
 * mid-conversation — see agent/tools.ts's check_followup_feedback tool), decides whether this is a
 * reply to a recent post-treatment follow-up and, if the sentiment is POSITIVE, sends a Google
 * Review request. Returns "NO_MATCH" (no DB write, nothing logged) when the phone doesn't resolve
 * to a client or that client has no sent-but-not-yet-requested follow-up — this is the ordinary
 * case for ANY unrelated customer message, not an error.
 */
export async function maybeSendReviewRequest(opts: {
  phone: string;
  feedbackText: string;
  platform: string;
}): Promise<ReviewRequestOutcome> {
  try {
    const client = await lookupClientByPhone(opts.phone);
    if (!client?.id) return { status: "NO_MATCH" };

    const sends = await readFollowupSendsForClient(client.id, 5);
    const recentSent = sends.find((s) => s.status === "sent");
    if (!recentSent) return { status: "NO_MATCH" };

    const sb = getSupabase();
    const { data: existing } = await sb
      .from(TABLE)
      .select("id")
      .eq("appointment_id", recentSent.appointmentId)
      .maybeSingle();

    const sentiment = classifyFollowupResponse(opts.feedbackText);
    const clinic = await getClinicConfig();
    const decision = decideReviewRequestOutcome({
      sentiment,
      hasReviewUrl: !!clinic.googleReviewUrl,
      alreadyRequested: !!existing,
    });

    if (decision.action === "skip") {
      // A duplicate attempt's outcome is already recorded from the first attempt — inserting a
      // second SKIPPED row for the same appointment_id would violate the table's UNIQUE constraint
      // and isn't useful (nothing new happened).
      if (decision.reason === "duplicate request") {
        return { status: "SKIPPED", reason: decision.reason, sentiment };
      }
      await logReviewRequest({
        appointmentId: recentSent.appointmentId,
        clientId: client.id,
        clientName: client.name,
        phone: opts.phone,
        email: client.email,
        feedbackText: opts.feedbackText,
        sentiment,
        status: "SKIPPED",
        skipReason: decision.reason,
        googleReviewUrl: clinic.googleReviewUrl,
        platform: opts.platform,
      });
      return { status: "SKIPPED", reason: decision.reason, sentiment };
    }

    const template =
      process.env.REVIEW_REQUEST_MESSAGE_TEMPLATE?.trim() || DEFAULT_REVIEW_REQUEST_MESSAGE;
    const text = personalizeReviewMessage(template, client.name, clinic.googleReviewUrl!);

    try {
      const { emailSent, emailError } = await trySend(getMessagingProvider(), {
        to: opts.phone,
        text,
        email: client.email,
        subject: "Would you share your experience with us?",
        flowType: "review-request",
        emailLog: {
          category: "review-request",
          triggerType: "system",
          sourceId: recentSent.appointmentId,
          sourceName: "Google Review request",
          clientId: client.id,
          clientName: client.name,
        },
      });

      const status = emailSent ? "SENT" : "FAILED";
      await logReviewRequest({
        appointmentId: recentSent.appointmentId,
        clientId: client.id,
        clientName: client.name,
        phone: opts.phone,
        email: client.email,
        feedbackText: opts.feedbackText,
        sentiment,
        status,
        skipReason: emailSent ? undefined : (emailError ?? "send failed"),
        googleReviewUrl: clinic.googleReviewUrl,
        platform: opts.platform,
      });
      return { status, sentiment, reason: emailSent ? undefined : emailError };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await logReviewRequest({
        appointmentId: recentSent.appointmentId,
        clientId: client.id,
        clientName: client.name,
        phone: opts.phone,
        email: client.email,
        feedbackText: opts.feedbackText,
        sentiment,
        status: "FAILED",
        skipReason: reason,
        googleReviewUrl: clinic.googleReviewUrl,
        platform: opts.platform,
      });
      return { status: "FAILED", sentiment, reason };
    }
  } catch (err) {
    console.error("[review-request] maybeSendReviewRequest failed:", err);
    return { status: "FAILED", reason: err instanceof Error ? err.message : String(err) };
  }
}
