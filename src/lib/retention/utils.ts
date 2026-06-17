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
}

/**
 * Sends a retention message through up to three channels in parallel:
 *
 *  1. Primary provider  — the configured messaging provider
 *                         (Telegram / WhatsApp / Discord, set via MESSAGING_PROVIDER)
 *  2. Discord channel   — always mirrors to DISCORD_RETENTION_CHANNEL_ID so staff
 *                         see every outbound message in real time.
 *                         Skipped when the primary provider is already Discord.
 *  3. Email             — sent via Resend to msg.email when provided and
 *                         RESEND_API_KEY is configured.
 *
 * DEMO_MODE=true short-circuits all sends and logs a simulation line.
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
    };
  }

  // ── build channel tasks ─────────────────────────────────────────────────────

  const retentionChannelId = process.env.DISCORD_RETENTION_CHANNEL_ID;
  const willMirrorDiscord = !!(retentionChannelId && messaging.platform !== "discord");
  const willSendEmail = !!(msg.email && process.env.RESEND_API_KEY);

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
          subject: msg.subject ?? "A message from Lumière Med Spa",
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

  if (emailRes.status === "rejected") {
    console.error(
      "[trySend] Email send failed:",
      emailRes.reason instanceof Error ? emailRes.reason.message : emailRes.reason,
    );
  }

  const emailSent = willSendEmail && emailRes.status === "fulfilled";
  const discordMirrored = willMirrorDiscord && discordRes.status === "fulfilled";

  console.log(
    `[trySend] sent via ${messaging.platform}` +
      (discordMirrored ? " + discord-mirror" : "") +
      (emailSent ? ` + email(${msg.email})` : ""),
  );

  return { platform: messaging.platform, simulated: false, emailSent, discordMirrored };
}
