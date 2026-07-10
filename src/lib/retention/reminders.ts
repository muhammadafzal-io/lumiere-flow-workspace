import { getUpcomingAppointments } from "@/lib/integrations/google-calendar";
import { lookupClient, updateClientField } from "@/lib/integrations/airtable";
import { logEvent } from "@/lib/integrations/activity-log";
import { postEscalation } from "@/lib/integrations/slack";
import { getMessagingProvider } from "@/lib/messaging";
import { trySend } from "@/lib/retention/utils";
import type { RetentionResult, RunFlowOptions } from "@/types";
import { getClinicConfig } from "@/lib/clinic-config";

function hoursUntil(isoTime: string): number {
  return (new Date(isoTime).getTime() - Date.now()) / (1000 * 60 * 60);
}

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
  tz: string,
  address: string,
): string {
  const displayTime = new Date(startTime).toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const intro = {
    "T-72h": `Hi ${clientName}, just a friendly reminder that you have an upcoming appointment at Lumière.`,
    "T-24h": `Hi ${clientName}, your Lumière appointment is tomorrow. We're looking forward to seeing you!`,
    "T-2h": `Hi ${clientName}, your appointment at Lumière is in about 2 hours.`,
  }[window];

  return `${intro}\n\nTreatment: ${treatment}\nTime: ${displayTime}\nLocation: ${address}\n\nPlease confirm your attendance:`;
}

function buildReminderSubject(
  treatment: string,
  startTime: string,
  window: string,
  tz: string,
): string {
  const displayDate = new Date(startTime).toLocaleString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const label = window === "T-2h" ? "in 2 hours" : window === "T-24h" ? "tomorrow" : "in 3 days";
  return `Your ${treatment} appointment ${label} — ${displayDate}`;
}

export async function runReminderFlow(opts?: RunFlowOptions): Promise<RetentionResult> {
  const { timezone: tz, address } = await getClinicConfig();
  const messaging = getMessagingProvider();
  let appointments = await getUpcomingAppointments(4);
  if (opts?.appointmentIds?.length) {
    const idSet = new Set(opts.appointmentIds);
    appointments = appointments.filter((a) => idSet.has(a.id ?? a.clientContact));
  }
  const result: RetentionResult = { sent: 0, skipped: 0, failed: 0, details: [] };

  for (const appt of appointments) {
    if (!appt.clientContact) {
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
      const displayTime = new Date(appt.startTime).toLocaleString("en-US", {
        timeZone: tz,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      result.skipped++;
      result.details.push({
        clientId: appt.id ?? "",
        clientName: appt.clientName,
        status: "skipped",
        reason: `${Math.round(hours)}h away (appt: ${displayTime}) — outside reminder windows T-72h/T-24h/T-2h`,
      });
      continue;
    }

    const client = await lookupClient({ phone: appt.clientContact }).catch(() => null);
    const displayName = client?.name?.trim() || appt.clientName;

    if (client?.lastReminderSent) {
      const minsSince = (Date.now() - new Date(client.lastReminderSent).getTime()) / 60_000;
      if (minsSince < 60) {
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
      const text = buildReminderText(
        displayName,
        appt.treatment,
        appt.startTime,
        window,
        tz,
        address,
      );

      const { platform, simulated, emailSent, discordMirrored, emailError } = await trySend(
        messaging,
        {
          to: deliverTo,
          text,
          buttons: [
            { text: "Confirm", callbackData: `confirm:${appt.id}` },
            { text: "Reschedule", callbackData: `reschedule:${appt.id}` },
            { text: "Cancel", callbackData: `cancel:${appt.id}` },
          ],
          email: client?.email,
          subject: buildReminderSubject(appt.treatment, appt.startTime, window, tz),
          flowType: "reminder",
          emailLog: {
            category: "reminder",
            triggerType: opts?.trigger ?? "cron",
            clientId: client?.id,
            clientName: displayName,
          },
        },
      );

      if (client?.id) {
        await updateClientField(client.id, { "Last Reminder Sent": new Date().toISOString() });
      }

      await logEvent(
        "reminder",
        displayName,
        `${window} reminder ${simulated ? "queued (simulation)" : "sent"} for ${appt.treatment}`,
        { clientId: client?.id, phone: appt.clientContact, platform },
      );

      result.sent++;
      result.details.push({
        clientId: appt.id ?? "",
        clientName: displayName,
        status: "sent",
        contact: deliverTo,
        platform,
        messagePreview: `${window} reminder for ${appt.treatment} on ${new Date(appt.startTime).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}${simulated ? " (simulated)" : ""}`,
        emailAddress: client?.email ?? null,
        emailSent,
        discordMirrored,
        ...(!emailSent && { emailSkipReason: emailError }),
      });

      if (window === "T-2h" && !client?.lastReminderSent) {
        postEscalation({
          reason: `No confirmation received — appointment in ~2 hours`,
          clientInfo: `${displayName} (${appt.clientContact})`,
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
