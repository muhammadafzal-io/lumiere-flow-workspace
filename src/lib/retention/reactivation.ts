import OpenAI from "openai";
import { getDormantClients, updateClientField } from "@/lib/integrations/airtable";
import { logEvent } from "@/lib/integrations/activity-log";
import { getMessagingProvider } from "@/lib/messaging";
import { trySend } from "@/lib/retention/utils";
import type { Client, RetentionResult, RunFlowOptions } from "@/types";
import { WIDGET_URL } from "@/lib/client-channels";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const CAMPAIGN = {
  incentive: "20% off your next visit",
  incentiveCode: "WELCOMEBACK20",
  validDays: 30,
};

const STEP_TONE: Record<number, string> = {
  1: `Warm and welcoming. This is their first touch after a long absence. Mention their last treatment, offer the incentive code, and invite them back. 3–4 sentences.`,
  2: `Gentle follow-up. Acknowledge it's been a while since you last reached out. Briefly remind them of the incentive (still valid). Keep it light and friendly. 2–3 sentences.`,
  3: `Final, no-pressure check-in. Let them know you're here whenever they're ready. Mention the incentive one last time as a parting gesture. Warm but brief. 2 sentences max.`,
};

async function generatePersonalisedMessage(client: Client, step: number): Promise<string> {
  const tone = STEP_TONE[step] ?? STEP_TONE[1];

  const prompt = `Write a reactivation text message from Lumiere Med Spa to a client named ${client.name}.
Their last visit was ${client.lastVisit ?? "several months ago"} and they received ${client.lastTreatment ?? "a treatment"}.
This is follow-up #${step} of 3.
Tone: ${tone}
Offer: ${CAMPAIGN.incentive} using code ${CAMPAIGN.incentiveCode} (valid ${CAMPAIGN.validDays} days). Online booking: ${WIDGET_URL}.
Sound like it's from their favourite spa — warm, personal, not salesy.
Write ONLY the message text — no subject line, no quotes, no explanation. No emojis. Plain text only.`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  return (
    response.choices[0].message.content ??
    `Hi ${client.name}! We miss you at Lumière. Use code ${CAMPAIGN.incentiveCode} for ${CAMPAIGN.incentive}. Book online: ${WIDGET_URL}`
  );
}

function daysSince(iso?: string): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

export async function runReactivationFlow(opts?: RunFlowOptions): Promise<RetentionResult> {
  const messaging = getMessagingProvider();
  let clients = await getDormantClients(90);
  if (opts?.clientIds?.length) {
    const idSet = new Set(opts.clientIds);
    clients = clients.filter((c) => c.id && idSet.has(c.id));
  }
  const result: RetentionResult = { sent: 0, skipped: 0, failed: 0, details: [] };

  for (const client of clients) {
    const step = (client.reactivationStep ?? 0) + 1;
    const lastSentAt = client.lastReactivationSent;

    // Stop cadence after 3 follow-ups
    if (step > 3) {
      result.skipped++;
      result.details.push({
        clientId: client.id ?? "",
        clientName: client.name,
        status: "skipped",
        reason: "cadence complete (3/3 sent)",
      });
      continue;
    }

    // Enforce 14-day gap between each follow-up
    if (daysSince(lastSentAt) < 14) {
      result.skipped++;
      result.details.push({
        clientId: client.id ?? "",
        clientName: client.name,
        status: "skipped",
        reason: `follow-up ${step - 1} sent ${Math.floor(daysSince(lastSentAt))} days ago`,
      });
      continue;
    }

    const contactId = client.telegramId ?? client.phone;
    if (!contactId) {
      result.skipped++;
      result.details.push({
        clientId: client.id ?? "",
        clientName: client.name,
        status: "skipped",
        reason: "no contact info",
      });
      continue;
    }

    try {
      const message = await generatePersonalisedMessage(client, step);

      const { platform, simulated, emailSent, discordMirrored, emailError } = await trySend(
        messaging,
        {
          to: contactId,
          text: message,
          email: client.email,
          subject:
            step === 1
              ? `We'd love to see you again, ${client.name}`
              : step === 2
                ? `Still thinking about us? Your offer is waiting, ${client.name}`
                : `One last thing before we go, ${client.name}`,
          flowType: "reactivation",
          emailLog: {
            category: "reactivation",
            triggerType: opts?.trigger ?? "cron",
            clientId: client.id,
            clientName: client.name,
          },
        },
      );

      if (client.id) {
        await updateClientField(client.id, {
          "Last Reactivation Sent": new Date().toISOString(),
          "Reactivation Step": step,
          ...(step === 3 ? { Status: "Dormant" } : { Status: "Active" }),
        });
      }

      await logEvent(
        "reactivation",
        client.name,
        `Reactivation follow-up ${step}/3 ${simulated ? "queued (simulation)" : "sent"}. Last treatment: ${client.lastTreatment ?? "unknown"}. Incentive: ${CAMPAIGN.incentiveCode}`,
        { clientId: client.id, phone: client.phone, email: client.email, platform },
      );

      result.sent++;
      result.details.push({
        clientId: client.id ?? "",
        clientName: client.name,
        status: "sent",
        contact: contactId,
        platform,
        messagePreview: `[Step ${step}/3] ${message.substring(0, 80)}...${simulated ? " (simulated)" : ""}`,
        emailAddress: client.email ?? null,
        emailSent,
        discordMirrored,
        ...(!emailSent && { emailSkipReason: emailError }),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        `[reactivation] FAILED → ${client.name} | step: ${step}/3 | contact: ${contactId} | error: ${reason}`,
      );
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
