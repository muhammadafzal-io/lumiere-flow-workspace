import "server-only";

import { logEvent } from "@/lib/integrations/activity-log";
import { getMessagingProvider } from "@/lib/messaging";
import { getClinicConfig } from "@/lib/clinic-config";
import { listFollowupCandidates } from "@/lib/retention/followup-candidates";
import { recordFollowupSend } from "@/lib/retention/followup-sends";
import { trySend } from "@/lib/retention/utils";
import { widgetLinkLine } from "@/lib/client-channels";
import type { AudienceFilters } from "@/lib/retention/audience-config";
import type { RetentionResult, RunFlowOptions } from "@/types";

/**
 * Email replies never reach the agent (no inbound email channel exists — only
 * WhatsApp/Discord/widget do), so the feedback CTA must point there instead of
 * "reply to this email," or a positive reply here would never trigger a review
 * request via check_followup_feedback.
 *
 * The Google review link is included here for every recipient (not gated on a
 * positive reply first, unlike review-request.ts's separate sentiment-gated
 * flow) — deliberately asks everyone up front rather than waiting on a reply.
 */
function buildDefaultMessage(reviewUrl: string | null): string {
  const reviewLine = reviewUrl
    ? `\n\nLoved your visit? We'd really appreciate a quick Google review — it helps other clients find us: {review_url}`
    : "";
  return `Hi {first_name},

Thank you for visiting Lumière for your {treatment} treatment!

We hope you're feeling wonderful. How are you doing, and are you satisfied with your results so far?

We'd love to hear your feedback — ${widgetLinkLine()}${reviewLine}

Warmly,
The Lumière Team`;
}

function personalizeMessage(
  template: string,
  name: string,
  treatment: string,
  reviewUrl: string | null,
): string {
  const first = name.trim().split(/\s+/)[0] || name;
  return template
    .replace(/\{first_name\}/g, first)
    .replace(/\{treatment\}/g, treatment || "recent")
    .replace(/\{review_url\}/g, reviewUrl ?? "");
}

function buildSubject(name: string, treatment: string): string {
  const first = name.trim().split(/\s+/)[0] || name;
  return `How are you feeling after your ${treatment || "visit"}, ${first}?`;
}

export async function runFollowupFlow(
  opts?: RunFlowOptions & { filters?: AudienceFilters },
): Promise<RetentionResult> {
  const messaging = getMessagingProvider();
  const filters: AudienceFilters = {
    followup_min_days: 1,
    followup_max_days: 14,
    followup_not_sent: true,
    has_email: true,
    ...opts?.filters,
  };

  let candidates = await listFollowupCandidates(filters);

  if (opts?.appointmentIds?.length) {
    const idSet = new Set(opts.appointmentIds);
    candidates = candidates.filter((c) => idSet.has(c.appointmentId));
  }

  const result: RetentionResult = { sent: 0, skipped: 0, failed: 0, details: [] };
  const clinic = await getClinicConfig();
  const reviewUrl = clinic.googleReviewUrl;
  const template = process.env.FOLLOWUP_MESSAGE_TEMPLATE?.trim() || buildDefaultMessage(reviewUrl);

  for (const c of candidates) {
    if (!c.email) {
      result.skipped++;
      result.details.push({
        clientId: c.clientId ?? c.appointmentId,
        clientName: c.clientName,
        status: "skipped",
        reason: "no email on file",
      });
      await recordFollowupSend({
        appointmentId: c.appointmentId,
        clientId: c.clientId,
        clientName: c.clientName,
        clientEmail: "",
        treatment: c.treatment,
        appointmentEnd: c.endTime,
        status: "skipped",
      });
      continue;
    }

    const text = personalizeMessage(template, c.clientName, c.treatment, reviewUrl);

    try {
      const { platform, simulated, emailSent, discordMirrored, emailError } = await trySend(
        messaging,
        {
          to: c.clientContact || c.email,
          text,
          email: c.email,
          subject: buildSubject(c.clientName, c.treatment),
          flowType: "followup",
          emailLog: {
            category: "followup",
            triggerType: opts?.trigger ?? "manual",
            sourceId: c.appointmentId,
            sourceName: "Post-treatment follow-up",
            clientId: c.clientId,
            clientName: c.clientName,
          },
        },
      );

      const sendStatus = emailSent ? "sent" : "failed";
      await recordFollowupSend({
        appointmentId: c.appointmentId,
        clientId: c.clientId,
        clientName: c.clientName,
        clientEmail: c.email,
        treatment: c.treatment,
        appointmentEnd: c.endTime,
        status: emailSent ? "sent" : "failed",
      });

      await logEvent(
        "followup",
        c.clientName,
        `Post-treatment follow-up ${simulated ? "queued (simulation)" : sendStatus} for ${c.treatment}.${emailSent ? ` Email: ${c.email}` : ""}`,
        {
          clientId: c.clientId,
          phone: c.clientContact,
          email: c.email,
          platform,
        },
      );

      if (emailSent) {
        result.sent++;
        result.details.push({
          clientId: c.clientId ?? c.appointmentId,
          clientName: c.clientName,
          status: "sent",
          contact: c.email,
          platform,
          messagePreview: text.slice(0, 80) + (simulated ? " (simulated)" : ""),
          emailAddress: c.email,
          emailSent,
          discordMirrored,
        });
      } else {
        result.failed++;
        result.details.push({
          clientId: c.clientId ?? c.appointmentId,
          clientName: c.clientName,
          status: "failed",
          reason: emailError ?? "email delivery failed",
          emailAddress: c.email,
          emailSent: false,
          emailSkipReason: emailError,
        });
      }
    } catch (err) {
      result.failed++;
      const reason = err instanceof Error ? err.message : String(err);
      result.details.push({
        clientId: c.clientId ?? c.appointmentId,
        clientName: c.clientName,
        status: "failed",
        reason,
      });
      await recordFollowupSend({
        appointmentId: c.appointmentId,
        clientId: c.clientId,
        clientName: c.clientName,
        clientEmail: c.email,
        treatment: c.treatment,
        appointmentEnd: c.endTime,
        status: "failed",
      });
    }
  }

  return result;
}
