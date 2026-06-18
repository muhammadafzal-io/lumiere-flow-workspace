import type { MessagingProvider } from "@/lib/messaging";
import type { OutboundMessage } from "@/types";
import type { EmailFlowType } from "@/lib/integrations/email";
import { sendRetentionEmail } from "@/lib/integrations/email";
import { DiscordProvider } from "@/lib/messaging/discord";

export interface TrySendOptions extends OutboundMessage {
  /** Flow type used to pick the email accent colour and icon */
  flowType?: EmailFlowType;
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
  // ── demo short-circuit ──────────────────────────────────────────────────────
  if (process.env.DEMO_MODE === "true") {
    console.log(
      `[retention/sim] DEMO_MODE → ${msg.to}${msg.email ? ` + ${msg.email}` : ""} | ${msg.text.slice(0, 60)}...`,
    );
    return {
      platform: messaging.platform,
      simulated: true,
      emailSent: false,
      discordMirrored: false,
      emailError: "DEMO_MODE is enabled",
    };
  }

  // ── pre-flight checks (surface skip reasons immediately) ───────────────────
  let emailSkipReason: string | undefined;
  if (!msg.email) {
    emailSkipReason = "no email address on client record";
  } else if (!process.env.RESEND_API_KEY) {
    emailSkipReason = "RESEND_API_KEY not set in environment";
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
          subject: msg.subject ?? "A message from Lumiere Med Spa",
          text: msg.text,
          flowType: msg.flowType,
        })
      : Promise.resolve(),
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
