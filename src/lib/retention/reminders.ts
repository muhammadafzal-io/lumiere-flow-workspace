import { getUpcomingAppointments } from "@/lib/integrations/google-calendar";
import { lookupClient, updateClientField } from "@/lib/integrations/airtable";
import { logEvent } from "@/lib/integrations/activity-log";
import { postEscalation } from "@/lib/integrations/slack";
import { getMessagingProvider } from "@/lib/messaging";
import type { RetentionResult } from "@/types";

function hoursUntil(isoTime: string): number {
  return (new Date(isoTime).getTime() - Date.now()) / (1000 * 60 * 60);
}

// Windows are ±4h around each target (72h, 24h, 2h) so that at least one
// cron firing (schedule: 3× daily, max gap ~12h) falls inside each window.
// The 60-min dedup guard in the calling code prevents double-sends.
function reminderWindow(hoursAhead: number): "T-72h" | "T-24h" | "T-2h" | null {
  if (hoursAhead >= 68 && hoursAhead <= 76) return "T-72h";
  if (hoursAhead >= 20 && hoursAhead <= 28) return "T-24h";
  if (hoursAhead >= 1 && hoursAhead <= 4) return "T-2h";
  return null;
}

function buildReminderText(
  clientName: string,
  treatment: string,
  startTime: string,
  window: string,
): string {
  const displayTime = new Date(startTime).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const intro = {
    "T-72h": `Hi ${clientName}, just a friendly reminder that you have an upcoming appointment at Lumiere.`,
    "T-24h": `Hi ${clientName}, your Lumiere appointment is tomorrow. We're looking forward to seeing you!`,
    "T-2h": `Hi ${clientName}, your appointment at Lumiere is in about 2 hours.`,
  }[window];

  return `${intro}\n\nTreatment: ${treatment}\nTime: ${displayTime}\nLocation: 2847 S Lamar Blvd, Suite 120, Austin TX\n\nPlease confirm your attendance:`;
}

export async function runReminderFlow(): Promise<RetentionResult> {
  const messaging = getMessagingProvider();
  const appointments = await getUpcomingAppointments(4);
  const result: RetentionResult = { sent: 0, skipped: 0, failed: 0, details: [] };

  for (const appt of appointments) {
    if (!appt.clientContact) {
      console.log(`[reminder] SKIP → ${appt.clientName} | reason: no contact info`);
      result.skipped++;
      result.details.push({
        clientId: appt.id ?? "",
        clientName: appt.clientName,
        status: "skipped",
        reason: "no contact info",
      });
      continue;
    }

    const hours = hoursUntil(appt.startTime);
    const window = reminderWindow(hours);

    if (!window) {
      console.log(
        `[reminder] SKIP → ${appt.clientName} | reason: ${Math.round(hours)}h away — outside all reminder windows`,
      );
      result.skipped++;
      result.details.push({
        clientId: appt.id ?? "",
        clientName: appt.clientName,
        status: "skipped",
        reason: `${Math.round(hours)}h away — outside all reminder windows (71-73h, 23-25h, 1.5-2.5h)`,
      });
      continue;
    }

    const client = await lookupClient({ phone: appt.clientContact }).catch(() => null);

    // Skip if a reminder was sent within the last 60 minutes (duplicate cron guard)
    if (client?.lastReminderSent) {
      const minsSince = (Date.now() - new Date(client.lastReminderSent).getTime()) / 60_000;
      if (minsSince < 60) {
        console.log(
          `[reminder] SKIP → ${appt.clientName} | reason: reminder already sent ${Math.round(minsSince)}min ago`,
        );
        result.skipped++;
        result.details.push({
          clientId: appt.id ?? "",
          clientName: appt.clientName,
          status: "skipped",
          reason: "reminder already sent recently",
        });
        continue;
      }
    }

    const deliverTo = client?.telegramId ?? appt.clientContact;

    try {
      const text = buildReminderText(appt.clientName, appt.treatment, appt.startTime, window);

      await messaging.send({
        to: deliverTo,
        text,
        buttons: [
          { text: "Confirm", callbackData: `confirm:${appt.id}` },
          { text: "Reschedule", callbackData: `reschedule:${appt.id}` },
          { text: "Cancel", callbackData: `cancel:${appt.id}` },
        ],
      });

      console.log(
        `[reminder] SENT → ${appt.clientName} | window: ${window} | platform: ${messaging.platform} | contact: ${deliverTo}`,
      );

      if (client?.id) {
        await updateClientField(client.id, { "Last Reminder Sent": new Date().toISOString() });
      }

      await logEvent("reminder", appt.clientName, `${window} reminder sent for ${appt.treatment}`, {
        clientId: client?.id,
        phone: appt.clientContact,
        platform: messaging.platform,
      });

      result.sent++;
      result.details.push({
        clientId: appt.id ?? "",
        clientName: appt.clientName,
        status: "sent",
        contact: deliverTo,
        platform: messaging.platform,
        messagePreview: `${window} reminder for ${appt.treatment}`,
      });

      if (window === "T-2h" && appt.confirmed === "pending") {
        postEscalation({
          reason: `No confirmation received — appointment in ~2 hours`,
          clientInfo: `${appt.clientName} (${appt.clientContact})`,
          conversationSummary: `${appt.treatment} at ${appt.startTime}. No response to prior reminders.`,
          platform: "reminder-flow",
        }).catch((e) => console.error("[reminder] Slack escalation failed:", e));
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        `[reminder] FAILED → ${appt.clientName} | contact: ${deliverTo} | error: ${reason}`,
      );
      result.failed++;
      result.details.push({
        clientId: appt.id ?? "",
        clientName: appt.clientName,
        status: "failed",
        contact: appt.clientContact,
        platform: messaging.platform,
        reason,
      });
    }
  }

  return result;
}
