import type { MessagingProvider } from "@/lib/messaging";
import type { OutboundMessage } from "@/types";

/**
 * Tries to send a message via the configured messaging provider.
 *
 * Falls back to simulation only when DEMO_MODE=true is set.
 * When MESSAGING_PROVIDER=discord, clients without a Discord user ID are
 * automatically posted to DISCORD_CHAT_CHANNEL_ID by the DiscordProvider —
 * so all messages reach Discord regardless of whether the client has a Discord account.
 *
 * Simulated sends are still logged to the Activity Log so the dashboard shows data.
 */
export async function trySend(
  messaging: MessagingProvider,
  msg: OutboundMessage,
): Promise<{ platform: string; simulated: boolean }> {
  if (process.env.DEMO_MODE === "true") {
    console.log(`[retention/sim] DEMO_MODE → ${msg.to} | ${msg.text.slice(0, 60)}...`);
    return { platform: messaging.platform, simulated: true };
  }

  await messaging.send(msg);
  return { platform: messaging.platform, simulated: false };
}
