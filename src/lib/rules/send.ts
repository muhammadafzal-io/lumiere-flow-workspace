import "server-only";

import { getSupabase } from "@/lib/supabase";
import { logEvent } from "@/lib/integrations/activity-log";
import { logEmailSend, type EmailSendTrigger } from "@/lib/integrations/email-send-log";
import { getMessagingProvider } from "@/lib/messaging";
import { trySend } from "@/lib/retention/utils";
import type { Rule } from "@/lib/types";
import type { RetentionResult } from "@/types";

function personalize(
  template: string,
  name: string,
  offerCode?: string,
  lastTreatment?: string,
): string {
  const first = name.trim().split(/\s+/)[0] || name;
  return template
    .replace(/\{first_name\}/g, first)
    .replace(/\{credit_code\}/g, offerCode ?? "")
    .replace(/\{last_treatment\}/g, lastTreatment ?? "your last treatment");
}

export async function sendRuleEmails(
  rule: Rule,
  recipients: Array<{
    id: string;
    name: string;
    email?: string;
    phone?: string;
    treatment?: string;
  }>,
  opts?: { trigger?: EmailSendTrigger },
): Promise<RetentionResult> {
  const messaging = getMessagingProvider();
  const triggerType = opts?.trigger ?? "manual";
  const result: RetentionResult = { sent: 0, skipped: 0, failed: 0, details: [] };

  for (const r of recipients) {
    if (!r.email) {
      await logEmailSend({
        category: "rule",
        triggerType,
        sourceId: rule.id,
        sourceName: rule.name,
        clientId: r.id,
        clientName: r.name,
        toEmail: "",
        subject: rule.name,
        status: "skipped",
        failReason: "no email address",
      });
      result.skipped++;
      result.details.push({
        clientId: r.id,
        clientName: r.name,
        status: "skipped",
        reason: "no email address",
      });
      continue;
    }

    const text = personalize(rule.message_template, r.name, rule.offer_code, r.treatment);
    const contact = r.phone || r.email;

    try {
      const { platform, simulated, emailSent, emailError } = await trySend(messaging, {
        to: contact,
        text,
        email: r.email,
        subject: rule.name,
        flowType: "general",
        emailLog: {
          category: "rule",
          triggerType,
          sourceId: rule.id,
          sourceName: rule.name,
          clientId: r.id,
          clientName: r.name,
        },
      });

      if (simulated) {
        result.skipped++;
        result.details.push({
          clientId: r.id,
          clientName: r.name,
          status: "skipped",
          reason: emailError ?? "DEMO_MODE — email not sent",
        });
        continue;
      }

      if (!emailSent) {
        result.failed++;
        result.details.push({
          clientId: r.id,
          clientName: r.name,
          status: "failed",
          reason: emailError ?? "email failed",
        });
        continue;
      }

      await logEvent(
        "inquiry",
        r.name,
        `Rule "${rule.name}" email sent.${rule.offer_code ? ` Code: ${rule.offer_code}` : ""}`,
        {
          clientId: r.id,
          email: r.email,
          platform,
          status: "success",
        },
      );

      result.sent++;
      result.details.push({
        clientId: r.id,
        clientName: r.name,
        status: "sent",
        emailAddress: r.email,
        emailSent: true,
        messagePreview: text.slice(0, 80),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await logEmailSend({
        category: "rule",
        triggerType,
        sourceId: rule.id,
        sourceName: rule.name,
        clientId: r.id,
        clientName: r.name,
        toEmail: r.email ?? "",
        subject: rule.name,
        status: "failed",
        failReason: reason,
      });
      result.failed++;
      result.details.push({
        clientId: r.id,
        clientName: r.name,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (rule.id) {
    const sb = getSupabase();
    await sb.from("Rules").update({ "Last Run At": new Date().toISOString() }).eq("id", rule.id);
  }

  return result;
}
