import "server-only";

import { getSupabase } from "@/lib/supabase";
import { logEvent } from "@/lib/integrations/activity-log";
import { logEmailSend, type EmailSendTrigger } from "@/lib/integrations/email-send-log";
import { getClientById, updateClientField } from "@/lib/integrations/airtable";
import { getMessagingProvider } from "@/lib/messaging";
import { trySend } from "@/lib/retention/utils";
import { sanitizeEmailSubject } from "@/lib/integrations/email";
import { personalizeRuleMessage } from "@/lib/rules/personalize";
import { parseRuleOffer } from "@/lib/rules/offer-config";
import type { Rule } from "@/lib/types";
import type { RetentionResult } from "@/types";

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
  const offer = parseRuleOffer(rule);
  const isBirthdayRule = rule.trigger_type === "Birthday";
  const result: RetentionResult = { sent: 0, skipped: 0, failed: 0, details: [] };

  for (const r of recipients) {
    const emailSubject = sanitizeEmailSubject(rule.name);

    if (!r.email) {
      await logEmailSend({
        category: "rule",
        triggerType,
        sourceId: rule.id,
        sourceName: rule.name,
        clientId: r.id,
        clientName: r.name,
        toEmail: "",
        subject: emailSubject,
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

    if (isBirthdayRule) {
      // Independent of offer/coupon config — just guards against re-emailing the same client's
      // birthday greeting every time this rule runs within its trigger window (e.g. "7 days
      // before birthday" would otherwise match on 7 consecutive daily runs).
      const client = await getClientById(r.id);
      if (client?.birthdayCreditSent) {
        await logEmailSend({
          category: "rule",
          triggerType,
          sourceId: rule.id,
          sourceName: rule.name,
          clientId: r.id,
          clientName: r.name,
          toEmail: r.email,
          subject: emailSubject,
          status: "skipped",
          failReason: "birthday email already sent",
        });
        result.skipped++;
        result.details.push({
          clientId: r.id,
          clientName: r.name,
          status: "skipped",
          reason: "birthday email already sent this year",
        });
        continue;
      }
    }

    const text = personalizeRuleMessage(rule.message_template, {
      name: r.name,
      offerCode: rule.offer_code,
      offerType: offer.type,
      offerAmount: offer.amount,
      lastTreatment: r.treatment,
    });
    const contact = r.phone || r.email;

    try {
      const { platform, simulated, emailSent, emailError } = await trySend(messaging, {
        to: contact,
        text,
        email: r.email,
        subject: emailSubject,
        flowType: isBirthdayRule ? "birthday" : "general",
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

      if (isBirthdayRule && r.id) {
        await updateClientField(r.id, { "Birthday Credit Sent": true });
      }

      const logMessage = `Rule "${rule.name}" email sent.${rule.offer_code ? ` Code: ${rule.offer_code}` : ""}`;

      await logEvent("inquiry", r.name, logMessage, {
        clientId: r.id,
        email: r.email,
        platform,
        status: "success",
      });

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
        subject: emailSubject,
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
