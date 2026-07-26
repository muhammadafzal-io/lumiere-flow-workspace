import "server-only";
import { WhatsAppProvider } from "@/lib/messaging/whatsapp";
import { logEmailSend } from "@/lib/integrations/email-send-log";
import type { EmailSendLogMeta } from "@/lib/integrations/email";

export interface WhatsAppNotificationOptions {
  to: string;
  text: string;
  logMeta?: EmailSendLogMeta;
}

export interface WhatsAppTemplateOptions {
  to: string;
  templateName: string;
  languageCode: string;
  parameters: Record<string, string>;
  /** Plain-text rendering of the same message, used only for the audit-log preview. */
  logPreview: string;
  logMeta?: EmailSendLogMeta;
}

export interface WhatsAppNotificationOutcome {
  sent: boolean;
  error?: string;
}

function isConfigured(): boolean {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/**
 * Sends a WhatsApp notification and logs the outcome into the same `email_sends` table /
 * Email Log admin page every other transactional send already uses — `provider: "whatsapp"`
 * fits the existing untyped provider column with no schema change, and staff get one unified
 * audit trail across channels instead of a second log system. Never throws — a clinic that
 * hasn't configured WhatsApp (or a transient send failure after one retry) just reports
 * {sent: false}, mirroring how sendRetentionEmail resolves rather than throws when unconfigured.
 */
export async function sendWhatsAppNotification(
  opts: WhatsAppNotificationOptions,
): Promise<WhatsAppNotificationOutcome> {
  const persist = async (status: "sent" | "failed" | "skipped", failReason?: string) => {
    if (!opts.logMeta) return;
    await logEmailSend({
      ...opts.logMeta,
      toEmail: opts.to,
      status,
      provider: "whatsapp",
      failReason,
      messagePreview: opts.text.slice(0, 120),
    });
  };

  if (!isConfigured()) {
    const reason = "WhatsApp not configured (no WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID)";
    await persist("skipped", reason);
    return { sent: false, error: reason };
  }

  const provider = new WhatsAppProvider();
  try {
    await provider.send({ to: opts.to, text: opts.text });
    await persist("sent");
    return { sent: true };
  } catch (firstErr) {
    // One bounded retry for transient failures — matches this codebase's existing "no retry
    // queues, just a single extra attempt or fail over" ceiling (sendRetentionEmail doesn't
    // retry within a provider either, it just moves to the next configured one).
    try {
      await provider.send({ to: opts.to, text: opts.text });
      await persist("sent");
      return { sent: true };
    } catch (secondErr) {
      const error = secondErr instanceof Error ? secondErr.message : String(secondErr);
      console.error(`[whatsapp] send to ${opts.to} failed twice:`, firstErr, secondErr);
      await persist("failed", error);
      return { sent: false, error };
    }
  }
}

/**
 * Sends an approved Message Template — the only reliable delivery path for "cold" (business-
 * initiated) notifications, since WhatsApp silently accepts but never delivers free-form text
 * outside the recipient's 24h customer-service window. Same shape/logging/retry contract as
 * sendWhatsAppNotification above so call sites can pick either path without surprises.
 */
export async function sendWhatsAppTemplate(
  opts: WhatsAppTemplateOptions,
): Promise<WhatsAppNotificationOutcome> {
  const persist = async (status: "sent" | "failed" | "skipped", failReason?: string) => {
    if (!opts.logMeta) return;
    await logEmailSend({
      ...opts.logMeta,
      toEmail: opts.to,
      status,
      provider: "whatsapp",
      failReason,
      messagePreview: opts.logPreview.slice(0, 120),
    });
  };

  if (!isConfigured()) {
    const reason = "WhatsApp not configured (no WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID)";
    await persist("skipped", reason);
    return { sent: false, error: reason };
  }

  const provider = new WhatsAppProvider();
  const send = () =>
    provider.sendTemplate({
      to: opts.to,
      templateName: opts.templateName,
      languageCode: opts.languageCode,
      parameters: opts.parameters,
    });

  try {
    await send();
    await persist("sent");
    return { sent: true };
  } catch (firstErr) {
    try {
      await send();
      await persist("sent");
      return { sent: true };
    } catch (secondErr) {
      const error = secondErr instanceof Error ? secondErr.message : String(secondErr);
      console.error(`[whatsapp] template send to ${opts.to} failed twice:`, firstErr, secondErr);
      await persist("failed", error);
      return { sent: false, error };
    }
  }
}
