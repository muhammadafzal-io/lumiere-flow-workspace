import { getAllClients, updateClientField } from "@/lib/integrations/airtable";
import { logEvent } from "@/lib/integrations/activity-log";
import { postEscalation } from "@/lib/integrations/slack";
import { getMessagingProvider } from "@/lib/messaging";
import { widgetLinkLine } from "@/lib/client-channels";
import { trySend } from "@/lib/retention/utils";
import type { RetentionResult, RunFlowOptions } from "@/types";

function buildNoshowText(clientName: string, treatment: string): string {
  return [
    `Hi ${clientName}, we missed you at Lumiere today for your ${treatment} appointment.`,
    ``,
    `We completely understand that life gets busy. We'd love to reschedule at a time that works better for you.`,
    ``,
    widgetLinkLine(),
    `Or simply reply to this message and we'll find you a spot.`,
    ``,
    `We're here Monday-Saturday, 9 AM - 7 PM. Talk soon.`,
  ].join("\n");
}

export async function runNoshowFlow(opts?: RunFlowOptions): Promise<RetentionResult> {
  const messaging = getMessagingProvider();
  // Use Austin CT date so late-night runs don't shift to the next UTC day
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const result: RetentionResult = { sent: 0, skipped: 0, failed: 0, details: [] };

  const clients = await getAllClients();
  let noshows = clients.filter((c) => {
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

  if (opts?.clientIds?.length) {
    const idSet = new Set(opts.clientIds);
    noshows = noshows.filter((c) => c.id && idSet.has(c.id));
  }

  for (const client of noshows) {
    if (!client.telegramId && !client.phone) {
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

      const { platform, simulated, emailSent, discordMirrored, emailError } = await trySend(
        messaging,
        {
          to: contactId,
          text,
          buttons: [{ text: "Rebook Now", callbackData: "rebook:noshow" }],
          email: client.email,
          subject: `We missed you today, ${client.name} — let's reschedule`,
          flowType: "noshow",
          emailLog: {
            category: "noshow",
            triggerType: opts?.trigger ?? "cron",
            clientId: client.id,
            clientName: client.name,
          },
        },
      );

      if (client.id) {
        await updateClientField(client.id, { Status: "Active" });
      }

      await logEvent(
        "noshow-recovery",
        client.name,
        `No-show recovery ${simulated ? "queued (simulation)" : "sent"} for ${treatment}`,
        { clientId: client.id, phone: client.phone, email: client.email, platform },
      );

      postEscalation({
        reason: `No-show detected — recovery message ${simulated ? "queued" : "sent"}`,
        clientInfo: `${client.name} (${contactId})`,
        conversationSummary: `Client no-showed for ${treatment}. Recovery message ${simulated ? "simulated" : `sent via ${platform}`}. Status updated to Active.`,
        platform: "noshow-flow",
      }).catch((e) => console.error("[noshow] Slack notification failed:", e));

      result.sent++;
      result.details.push({
        clientId: client.id ?? "",
        clientName: client.name,
        status: "sent",
        contact: contactId,
        platform,
        messagePreview: text.substring(0, 80) + `...${simulated ? " (simulated)" : ""}`,
        emailAddress: client.email ?? null,
        emailSent,
        discordMirrored,
        ...(!emailSent && { emailSkipReason: emailError }),
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
