import { getUpcomingBirthdays, updateClientField } from "@/lib/integrations/airtable";
import { logEvent } from "@/lib/integrations/activity-log";
import { getMessagingProvider } from "@/lib/messaging";
import { trySend } from "@/lib/retention/utils";
import type { RetentionResult, RunFlowOptions } from "@/types";

const CREDIT_AMOUNT = 50;
const CREDIT_VALID_DAYS = 30;

/** Generates a code in the format BDAY-MA-X7K2|YYYY-MM-DD (expiry encoded) */
function generateCreditCode(clientName: string): string {
  const initials = clientName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0].toUpperCase())
    .join("");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const expiry = new Date(Date.now() + CREDIT_VALID_DAYS * 24 * 60 * 60_000).toLocaleDateString(
    "en-CA",
    { timeZone: "America/Chicago" },
  );
  return `BDAY-${initials}-${rand}|${expiry}`;
}

/** Returns the display code (without the expiry suffix) */
export function displayCode(raw: string): string {
  return raw.replace(/^USED:/, "").split("|")[0];
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
      const message = buildBirthdayMessage(client.name, displayCode(creditCode));

      const { platform, simulated, emailSent, discordMirrored, emailError } = await trySend(
        messaging,
        {
          to: contactId,
          text: message,
          email: client.email,
          subject: `Happy Birthday from the Lumière team — your $${CREDIT_AMOUNT} gift is inside`,
          flowType: "birthday",
        },
      );

      console.log(
        `[birthday] ${simulated ? "SIMULATED" : "SENT"} → ${client.name} | platform: ${platform} | email: ${emailSent ? client.email : "none"} | discord-mirror: ${discordMirrored} | contact: ${contactId} | code: ${creditCode}`,
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
        `Birthday credit ${simulated ? "queued (simulation)" : "sent"}. Code: ${displayCode(creditCode)}. Valid ${CREDIT_VALID_DAYS} days.${emailSent ? ` Email sent to ${client.email}.` : ""}`,
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
        messagePreview: `Code: ${displayCode(creditCode)} — $${CREDIT_AMOUNT} birthday credit${simulated ? " (simulated)" : ""}`,
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
