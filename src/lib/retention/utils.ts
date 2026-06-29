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
  /** Flow type used to pick the email accent colour and icon */
  flowType?: EmailFlowType;
  /** When set, each email attempt is persisted to email_sends */
  emailLog?: EmailSendLogMeta;
}

export interface TrySendResult {
  platform: string;
  simulated: boolean;
  emailSent: boolean;
  discordMirrored: boolean;
  /** Populated when emailSent=false — explains exactly why */
  emailError?: string;
}

/**
 * Sends a retention message through up to three channels in parallel:
 *
 *  1. Primary provider  — the configured messaging provider
 *  2. Discord channel   — mirrors to DISCORD_RETENTION_CHANNEL_ID for staff visibility
 *  3. Email             — sent via Resend to msg.email when provided
 *
 * DEMO_MODE=true short-circuits all sends.
 */
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

  // ── demo short-circuit ──────────────────────────────────────────────────────
  if (process.env.DEMO_MODE === "true") {
    console.log(
      `[retention/sim] DEMO_MODE → ${msg.to}${msg.email ? ` + ${msg.email}` : ""} | ${msg.text.slice(0, 60)}...`,
    );
    await logSkip("DEMO_MODE is enabled", true);
    return {
      platform: messaging.platform,
      simulated: true,
      emailSent: false,
      discordMirrored: false,
      emailError: "DEMO_MODE is enabled",
    };
  }

  // ── pre-flight checks (surface skip reasons immediately) ───────────────────
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

  console.log(
    `[trySend] email=${willSendEmail ? `will send to ${msg.email}` : `skipped — ${emailSkipReason}`} | discord-mirror=${willMirrorDiscord} | from=${process.env.RESEND_FROM_EMAIL ?? "default"}`,
  );

  // ── build channel tasks ─────────────────────────────────────────────────────
  const tasks: Promise<unknown>[] = [
    // 1. Primary provider
    messaging.send(msg),

    // 2. Discord staff channel mirror
    willMirrorDiscord
      ? new DiscordProvider().sendToChannel(retentionChannelId!, {
          ...msg,
          text: `📤 **${messaging.platform.toUpperCase()} → ${msg.to}**\n\n${msg.text}`,
        })
      : Promise.resolve(),

    // 3. Email to client
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

  console.log(
    `[trySend] RESULT — primary:${messaging.platform} email:${emailSent ? "sent" : `FAILED(${emailError})`} discord-mirror:${discordMirrored}`,
  );

  return { platform: messaging.platform, simulated: false, emailSent, discordMirrored, emailError };
}
