import { getUpcomingBirthdays, updateClientField } from "@/lib/integrations/airtable";
import { logEvent } from "@/lib/integrations/activity-log";
import { getMessagingProvider } from "@/lib/messaging";
import { trySend } from "@/lib/retention/utils";
import type { RetentionResult, RunFlowOptions } from "@/types";

import {
  BIRTHDAY_CREDIT_AMOUNT,
  BIRTHDAY_CREDIT_VALID_DAYS,
  displayBirthdayCode,
  generateBirthdayCreditCode,
} from "@/lib/credits/birthday-code";
import { widgetLinkLine } from "@/lib/client-channels";

/** @deprecated use displayBirthdayCode */
export const displayCode = displayBirthdayCode;

/** @deprecated use generateBirthdayCreditCode */
function generateCreditCode(clientName: string): string {
  return generateBirthdayCreditCode(clientName);
}

function buildBirthdayMessage(clientName: string, creditCode: string): string {
  return [
    `Happy early birthday, ${clientName}!`,
    ``,
    `The entire Lumiere team wishes you a wonderful birthday. To celebrate, we're sending you a special gift:`,
    ``,
    `$${BIRTHDAY_CREDIT_AMOUNT} birthday credit`,
    `Code: ${creditCode}`,
    `Valid for ${BIRTHDAY_CREDIT_VALID_DAYS} days — use it on any service!`,
    ``,
    `Book your birthday treat: ${widgetLinkLine()}`,
    ``,
    `Can't wait to see you!`,
    `- The Lumiere Team`,
  ].join("\n");
}

export async function runBirthdayFlow(opts?: RunFlowOptions): Promise<RetentionResult> {
  const messaging = getMessagingProvider();
  let clients = await getUpcomingBirthdays(7);
  if (opts?.clientIds?.length) {
    const idSet = new Set(opts.clientIds);
    clients = clients.filter((c) => c.id && idSet.has(c.id));
  }
  const result: RetentionResult = { sent: 0, skipped: 0, failed: 0, details: [] };

  for (const client of clients) {
    if (client.birthdayCreditSent) {
      result.skipped++;
      result.details.push({
        clientId: client.id ?? "",
        clientName: client.name,
        status: "skipped",
        reason: "credit already sent this year",
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
      const creditCode = generateBirthdayCreditCode(client.name);
      const message = buildBirthdayMessage(client.name, displayBirthdayCode(creditCode));

      const { platform, simulated, emailSent, discordMirrored, emailError } = await trySend(
        messaging,
        {
          to: contactId,
          text: message,
          email: client.email,
          subject: `Happy Birthday from the Lumière team — your $${BIRTHDAY_CREDIT_AMOUNT} gift is inside`,
          flowType: "birthday",
          emailLog: {
            category: "birthday",
            triggerType: opts?.trigger ?? "cron",
            clientId: client.id,
            clientName: client.name,
          },
        },
      );

      if (client.id) {
        await updateClientField(client.id, {
          "Credit Codes": creditCode,
          "Birthday Credit Sent": true,
        });
      }

      await logEvent(
        "birthday",
        client.name,
        `Birthday credit ${simulated ? "queued (simulation)" : "sent"}. Code: ${displayBirthdayCode(creditCode)}. Valid ${BIRTHDAY_CREDIT_VALID_DAYS} days.${emailSent ? ` Email sent to ${client.email}.` : ""}`,
        {
          clientId: client.id,
          phone: client.phone,
          email: client.email,
          platform,
        },
      );

      result.sent++;
      result.details.push({
        clientId: client.id ?? "",
        clientName: client.name,
        status: "sent",
        contact: contactId,
        platform,
        messagePreview: `Code: ${displayBirthdayCode(creditCode)} — $${BIRTHDAY_CREDIT_AMOUNT} birthday credit${simulated ? " (simulated)" : ""}`,
        emailAddress: client.email ?? null,
        emailSent,
        discordMirrored,
        ...(!emailSent && { emailSkipReason: emailError }),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        `[birthday] FAILED → ${client.name} | contact: ${contactId} | error: ${reason}`,
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
