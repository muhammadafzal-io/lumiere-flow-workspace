export const BIRTHDAY_CREDIT_AMOUNT = 50;
export const BIRTHDAY_CREDIT_VALID_DAYS = 30;

/** Generates a code in the format BDAY-MA-X7K2|YYYY-MM-DD (expiry encoded for chatbot checkout). */
export function generateBirthdayCreditCode(clientName: string): string {
  const initials = clientName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0].toUpperCase())
    .join("");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const expiry = new Date(
    Date.now() + BIRTHDAY_CREDIT_VALID_DAYS * 24 * 60 * 60_000,
  ).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  return `BDAY-${initials || "VIP"}-${rand}|${expiry}`;
}

/** Client-facing code (no expiry suffix) — use in emails and chatbot. */
export function displayBirthdayCode(raw: string): string {
  return raw.replace(/^USED:/, "").split("|")[0];
}

export const DEFAULT_BIRTHDAY_RULE_TEMPLATE = `Hi {first_name},

Happy early birthday from all of us at Lumière!

Enjoy a $${BIRTHDAY_CREDIT_AMOUNT} credit on your next visit. Use this code in our chatbot when you book:

{birthday_token}

Valid for ${BIRTHDAY_CREDIT_VALID_DAYS} days on any service.

— The Lumière Team`;
