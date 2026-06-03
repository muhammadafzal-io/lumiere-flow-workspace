import { getAllClients, updateClientField } from "@/lib/integrations/airtable";
import { logEvent } from "@/lib/integrations/activity-log";
import { postEscalation } from "@/lib/integrations/slack";
import { getMessagingProvider } from "@/lib/messaging";
import type { RetentionResult } from "@/types";

function buildNoshowText(clientName: string, treatment: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return [
    `Hi ${clientName}, we missed you at Lumiere today for your ${treatment} appointment.`,
    ``,
    `We completely understand that life gets busy. We'd love to reschedule at a time that works better for you.`,
    ``,
    `Book a new appointment here: ${appUrl}/widget`,
    `Or simply reply to this message and we'll find you a spot.`,
    ``,
    `We're here Monday-Saturday, 9 AM - 7 PM. Talk soon.`,
  ].join("\n");
}

export async function runNoshowFlow(): Promise<RetentionResult> {
  const messaging = getMessagingProvider();
  // Use Austin CT date so late-night runs don't shift to the next UTC day
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const result: RetentionResult = { sent: 0, skipped: 0, failed: 0, details: [] };

  const clients = await getAllClients();
  const noshows = clients.filter((c) => {
    if (c.status?.toLowerCase() !== "no-show") return false;
    if (!c.lastVisit) return false;
    // Plain YYYY-MM-DD date — compare directly (no timezone conversion needed)
    if (/^\d{4}-\d{2}-\d{2}$/.test(c.lastVisit)) return c.lastVisit === today;
    // Full ISO datetime — convert to Austin CT date
    const visitDate = new Date(c.lastVisit).toLocaleDateString("en-CA", {
      timeZone: "America/Chicago",
    });
    return visitDate === today;
  });

  for (const client of noshows) {
    if (!client.telegramId && !client.phone) {
      console.log(`[noshow] SKIP → ${client.name} | reason: no contact info`);
      result.skipped++;
      result.details.push({
        clientId: client.id ?? "",
        clientName: client.name,
        status: "skipped",
        reason: "no contact info",
      });
      continue;
    }

    const contactId = client.telegramId ?? client.phone!;
    const treatment = client.lastTreatment ?? "your appointment";

    try {
      const text = buildNoshowText(client.name, treatment);

      await messaging.send({
        to: contactId,
        text,
        buttons: [{ text: "Rebook Now", callbackData: "rebook:noshow" }],
      });

      console.log(
        `[noshow] SENT → ${client.name} | platform: ${messaging.platform} | contact: ${contactId}`,
      );

      if (client.id) {
        await updateClientField(client.id, { Status: "Active" });
      }

      await logEvent("noshow-recovery", client.name, `No-show recovery sent for ${treatment}`, {
        clientId: client.id,
        phone: client.phone,
        email: client.email,
        platform: messaging.platform,
      });

      postEscalation({
        reason: `No-show detected — recovery message sent`,
        clientInfo: `${client.name} (${contactId})`,
        conversationSummary: `Client no-showed for ${treatment}. Recovery message sent via ${messaging.platform}. Status updated to Active.`,
        platform: "noshow-flow",
      }).catch((e) => console.error("[noshow] Slack notification failed:", e));

      result.sent++;
      result.details.push({
        clientId: client.id ?? "",
        clientName: client.name,
        status: "sent",
        contact: contactId,
        platform: messaging.platform,
        messagePreview: text.substring(0, 80) + "...",
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[noshow] FAILED → ${client.name} | contact: ${contactId} | error: ${reason}`);
      result.failed++;
      result.details.push({
        clientId: client.id ?? "",
        clientName: client.name,
        status: "failed",
        contact: contactId,
        platform: messaging.platform,
        reason,
      });
    }
  }

  return result;
}
