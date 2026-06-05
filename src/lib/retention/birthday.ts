import { getUpcomingBirthdays, updateClientField } from "@/lib/integrations/airtable";
import { logEvent } from "@/lib/integrations/activity-log";
import { getMessagingProvider } from "@/lib/messaging";
import { trySend } from "@/lib/retention/utils";
import type { RetentionResult } from "@/types";

const CREDIT_AMOUNT = 50;
const CREDIT_VALID_DAYS = 30;

function generateCreditCode(clientName: string): string {
  const initials = clientName
    .split(" ")
    .map((n) => n[0].toUpperCase())
    .join("");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BDAY-${initials}-${rand}`;
}

function buildBirthdayMessage(clientName: string, creditCode: string): string {
  return [
    `Happy early birthday, ${clientName}!`,
    ``,
    `The entire Lumiere team wishes you a wonderful birthday. To celebrate, we're sending you a special gift:`,
    ``,
    `$${CREDIT_AMOUNT} birthday credit`,
    `Code: ${creditCode}`,
    `Valid for ${CREDIT_VALID_DAYS} days — use it on any service!`,
    ``,
    `Book your birthday treat: just reply here or visit us Monday-Saturday, 9 AM - 7 PM.`,
    ``,
    `Can't wait to see you!`,
    `- The Lumiere Team`,
  ].join("\n");
}

export async function runBirthdayFlow(): Promise<RetentionResult> {
  const messaging = getMessagingProvider();
  const clients = await getUpcomingBirthdays(7);
  const result: RetentionResult = { sent: 0, skipped: 0, failed: 0, details: [] };

  for (const client of clients) {
    if (client.birthdayCreditSent) {
      console.log(`[birthday] SKIP → ${client.name} | reason: credit already sent this year`);
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
      console.log(`[birthday] SKIP → ${client.name} | reason: no contact info`);
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
      const creditCode = generateCreditCode(client.name);
      const message = buildBirthdayMessage(client.name, creditCode);

      const { platform, simulated } = await trySend(messaging, { to: contactId, text: message });

      console.log(
        `[birthday] ${simulated ? "SIMULATED" : "SENT"} → ${client.name} | platform: ${platform} | contact: ${contactId} | code: ${creditCode}`,
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
        `Birthday credit ${simulated ? "queued (simulation)" : "sent"}. Code: ${creditCode}. Valid ${CREDIT_VALID_DAYS} days.`,
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
        messagePreview: `Code: ${creditCode} — $${CREDIT_AMOUNT} birthday credit${simulated ? " (simulated)" : ""}`,
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
