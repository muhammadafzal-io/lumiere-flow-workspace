import { lookupClientByPhone } from "@/lib/integrations/airtable";
import { phoneSearchVariants, extractPhoneForLookup } from "@/lib/phone";

export function normalizeEmail(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.includes("@")) return undefined;
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

export function hasBirthdayCollected(input: Record<string, unknown>): boolean {
  if (input.birthday_skipped === true || input.birthdaySkipped === true) return true;
  const bday = input.birthday;
  return typeof bday === "string" && bday.trim().length > 0;
}

/** Fill client_email / birthday from Supabase when upsert_client ran earlier in the session. */
export async function enrichBookingInput(input: Record<string, unknown>): Promise<void> {
  if (!input.client_contact) return;

  const client = await lookupClientByPhone(String(input.client_contact)).catch(() => null);
  if (!client) return;

  if (!normalizeEmail(input.client_email) && client.email) {
    input.client_email = client.email;
  }
  if (!hasBirthdayCollected(input) && client.birthday) {
    input.birthday = client.birthday;
  }
}

export async function validateBookAppointment(
  input: Record<string, unknown>,
): Promise<string | null> {
  await enrichBookingInput(input);

  const missing: string[] = [];
  if (!String(input.client_name ?? "").trim()) missing.push("client_name");
  if (!String(input.treatment ?? "").trim()) missing.push("treatment");
  if (!String(input.client_contact ?? "").trim()) missing.push("client_contact (phone)");
  if (!String(input.date_time ?? "").trim()) missing.push("date_time");
  if (!normalizeEmail(input.client_email)) missing.push("client_email");
  if (!hasBirthdayCollected(input)) {
    missing.push(
      "birthday (ask the caller, then pass birthday as MM-DD or birthday_skipped: true if they decline)",
    );
  }

  if (missing.length === 0) return null;
  return `Cannot book: missing required fields: ${missing.join(", ")}. Collect name, phone, email, and birthday BEFORE saying "Locking in your appointment now!"`;
}

export function validatePortalBooking(input: {
  clientName?: string;
  clientContact?: string;
  clientEmail?: string;
  treatment?: string;
  startTime?: string;
  endTime?: string;
  practitionerName?: string;
  room?: string;
  birthday?: string;
  birthdaySkipped?: boolean;
}): string | null {
  const missing: string[] = [];
  if (!String(input.clientName ?? "").trim()) missing.push("client name");
  if (!String(input.treatment ?? "").trim()) missing.push("treatment");
  if (!String(input.clientContact ?? "").trim()) missing.push("phone");
  if (!normalizeEmail(input.clientEmail)) missing.push("email");
  if (!String(input.startTime ?? "").trim()) missing.push("appointment time");
  if (!String(input.endTime ?? "").trim()) missing.push("appointment end time");
  if (!String(input.practitionerName ?? "").trim()) missing.push("practitioner");
  if (!String(input.room ?? "").trim()) missing.push("room");
  if (
    !hasBirthdayCollected({
      birthday: input.birthday,
      birthdaySkipped: input.birthdaySkipped,
    })
  ) {
    missing.push("birthday (MM-DD) or mark as declined");
  }

  if (missing.length === 0) return null;
  return `Missing required booking fields: ${missing.join(", ")}. Same requirements as the chatbot booking flow.`;
}

/** Fill client_name / client_email from CRM using phone (cancel, reschedule, find). */
export async function enrichClientFromPhone(input: Record<string, unknown>): Promise<void> {
  const rawPhone = extractPhoneForLookup(String(input.phone ?? input.client_contact ?? ""));
  if (!rawPhone) return;
  if (!input.phone) input.phone = rawPhone;

  let client = null as Awaited<ReturnType<typeof lookupClientByPhone>>;
  for (const variant of phoneSearchVariants(rawPhone)) {
    client = await lookupClientByPhone(variant).catch(() => null);
    if (client) break;
  }

  if (!client) return;

  if (!normalizeEmail(input.client_email) && client.email) {
    input.client_email = client.email;
  }
  if (!String(input.client_name ?? "").trim() && client.name) {
    input.client_name = client.name;
  }
  if (!input.phone) input.phone = rawPhone;
  if (client.phone) input.crm_record_phone = client.phone;
}

export async function enrichCancelRescheduleInput(input: Record<string, unknown>): Promise<void> {
  await enrichClientFromPhone(input);
}
