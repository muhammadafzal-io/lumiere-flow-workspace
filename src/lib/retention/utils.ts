import type { MessagingProvider } from "@/lib/messaging";
import type { OutboundMessage } from "@/types";

/**
 * Tries to send a message via the configured messaging provider.
 *
 * Falls back to simulation when:
 *  - DEMO_MODE=true env var is set, OR
 *  - The provider is Discord but the contact is a phone number (no Discord ID),
 *    which happens during demos where clients have phone numbers but not Discord accounts.
 *
 * Simulated sends are still logged to the Activity Log so the dashboard shows real data.
 * Returns the effective platform so callers can report it correctly.
 */
export async function trySend(
  messaging: MessagingProvider,
  msg: OutboundMessage,
): Promise<{ platform: string; simulated: boolean }> {
  const demoMode = process.env.DEMO_MODE === "true";

  if (demoMode) {
    console.log(`[retention/sim] DEMO_MODE → ${msg.to} | ${msg.text.slice(0, 60)}...`);
    return { platform: messaging.platform, simulated: true };
  }

  try {
    await messaging.send(msg);
    return { platform: messaging.platform, simulated: false };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);

    // Discord can't DM clients who only have phone numbers.
    // Treat as simulated so the flow still logs and counts the send.
    const isProviderMismatch =
      reason.includes("No Discord ID") ||
      reason.includes("Invalid Webhook Token") ||
      reason.includes("cannot deliver via Discord");

    if (isProviderMismatch) {
      console.log(
        `[retention/sim] SIMULATED (provider mismatch) → ${msg.to} | ${reason.slice(0, 80)}`,
      );
      return { platform: `${messaging.platform}(simulated)`, simulated: true };
    }

    // Any other error is a real failure — re-throw so the caller handles it
    throw err;
  }
}
