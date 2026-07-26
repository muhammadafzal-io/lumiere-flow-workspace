import type { MessagingProvider } from "@/lib/messaging";
import type { OutboundMessage } from "@/types";
import type { EmailFlowType } from "@/lib/integrations/email";
import {
  sendRetentionEmail,
  type EmailSendLogMeta,
  sanitizeEmailSubject,
} from "@/lib/integrations/email";
import { logEmailSend } from "@/lib/integrations/email-send-log";
import { DiscordProvider } from "@/lib/messaging/discord";

export interface TrySendOptions extends OutboundMessage {
  flowType?: EmailFlowType;
  emailLog?: EmailSendLogMeta;
}

export interface TrySendResult {
  platform: string;
  simulated: boolean;
  emailSent: boolean;
  discordMirrored: boolean;
  emailError?: string;
}

export async function trySend(
  messaging: MessagingProvider,
  msg: TrySendOptions,
): Promise<TrySendResult> {
  const subject = sanitizeEmailSubject(msg.subject ?? "A message from Lumiere Med Spa");
  const preview = msg.text.slice(0, 120);

  async function logSkip(reason: string, simulated = false) {
    if (!msg.emailLog) return;
    await logEmailSend({
      ...msg.emailLog,
      toEmail: msg.email ?? "",
      subject,
      messagePreview: preview,
      status: "skipped",
      failReason: reason,
      simulated,
    });
  }

  if (process.env.DEMO_MODE === "true") {
    await logSkip("DEMO_MODE is enabled", true);
    return {
      platform: messaging.platform,
      simulated: true,
      emailSent: false,
      discordMirrored: false,
      emailError: "DEMO_MODE is enabled",
    };
  }

  const hasEmailProvider = !!(
    (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) ||
    (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
    process.env.RESEND_API_KEY
  );

  let emailSkipReason: string | undefined;
  if (!msg.email) {
    emailSkipReason = "no email address on client record";
  } else if (!hasEmailProvider) {
    emailSkipReason = "no email provider configured (SendGrid, Gmail, or Resend)";
  }

  if (emailSkipReason) {
    await logSkip(emailSkipReason);
  }

  const retentionChannelId = process.env.DISCORD_RETENTION_CHANNEL_ID;
  const willMirrorDiscord = !!(retentionChannelId && messaging.platform !== "discord");
  const willSendEmail = !emailSkipReason;

  const tasks: Promise<unknown>[] = [
    messaging.send(msg),

    willMirrorDiscord
      ? new DiscordProvider().sendToChannel(retentionChannelId!, {
          ...msg,
          text: `📤 **${messaging.platform.toUpperCase()} → ${msg.to}**\n\n${msg.text}`,
        })
      : Promise.resolve(),

    willSendEmail
      ? sendRetentionEmail({
          to: msg.email!,
          subject,
          text: msg.text,
          flowType: msg.flowType,
          logMeta: msg.emailLog,
        })
      : Promise.resolve({ sent: false }),
  ];

  const [primaryRes, discordRes, emailRes] = await Promise.allSettled(tasks);

  // Log the primary channel's own outcome — previously only the parallel email send was
  // recorded, so a WhatsApp/Discord send (the actual primary channel whenever
  // MESSAGING_PROVIDER selects one) never showed up in the Email Log audit trail at all.
  if (msg.emailLog) {
    await logEmailSend({
      ...msg.emailLog,
      toEmail: msg.to,
      subject,
      messagePreview: preview,
      provider: messaging.platform,
      status: primaryRes.status === "fulfilled" ? "sent" : "failed",
      failReason:
        primaryRes.status === "rejected"
          ? primaryRes.reason instanceof Error
            ? primaryRes.reason.message
            : String(primaryRes.reason)
          : undefined,
    }).catch((e) => console.error("[trySend] primary channel log failed:", e));
  }

  if (primaryRes.status === "rejected") {
    throw primaryRes.reason instanceof Error
      ? primaryRes.reason
      : new Error(String(primaryRes.reason));
  }

  if (discordRes.status === "rejected") {
    console.error(
      "[trySend] Discord mirror failed:",
      discordRes.reason instanceof Error ? discordRes.reason.message : discordRes.reason,
    );
  }

  let emailError: string | undefined = emailSkipReason;
  if (willSendEmail && emailRes.status === "rejected") {
    emailError =
      emailRes.reason instanceof Error ? emailRes.reason.message : String(emailRes.reason);
    console.error("[trySend] Email send failed:", emailError);
  }

  const emailSent = willSendEmail && emailRes.status === "fulfilled";
  const discordMirrored = willMirrorDiscord && discordRes.status === "fulfilled";

  return { platform: messaging.platform, simulated: false, emailSent, discordMirrored, emailError };
}
