import { lookupClientByPhone } from "@/lib/integrations/airtable";
import { isValidBirthdayInput, normalizeBirthdayForStorage } from "@/lib/birthday";
import { phoneSearchVariants, extractPhoneForLookup } from "@/lib/phone";
import { fullNameValidationError, isFullName } from "@/lib/agent/client-name";

export function normalizeEmail(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.includes("@")) return undefined;
  const email = raw.trim().toLowerCase().replace(/\s+/g, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

/** Normalize email on booking payloads (strips spaces from speech/typing, e.g. "talha azeem@gmail.com"). */
export function sanitizeBookingEmails(input: Record<string, unknown>): void {
  const normalized = normalizeEmail(input.client_email);
  if (normalized) input.client_email = normalized;
  const portal = normalizeEmail(input.clientEmail);
  if (portal) input.clientEmail = portal;
}

export function hasValidBirthday(input: Record<string, unknown>): boolean {
  const bday = input.birthday;
  return typeof bday === "string" && isValidBirthdayInput(bday);
}

/** @deprecated Use hasValidBirthday — birthday cannot be skipped. */
export function hasBirthdayCollected(input: Record<string, unknown>): boolean {
  return hasValidBirthday(input);
}

/** Fill client_email / birthday from Supabase when upsert_client ran earlier in the session. */
export async function enrichBookingInput(input: Record<string, unknown>): Promise<void> {
  sanitizeBookingEmails(input);
  if (!input.client_contact) return;

  const client = await lookupClientByPhone(String(input.client_contact)).catch(() => null);
  if (!client) return;

  if (!normalizeEmail(input.client_email) && client.email) {
    input.client_email = client.email;
  }
  if (!hasValidBirthday(input) && client.birthday && isValidBirthdayInput(client.birthday)) {
    input.birthday = normalizeBirthdayForStorage(client.birthday);
  }
}

export async function validateBookAppointment(
  input: Record<string, unknown>,
): Promise<string | null> {
  await enrichBookingInput(input);

  const missing: string[] = [];
  const clientName = String(input.client_name ?? "").trim();
  if (!clientName) missing.push("client_name");
  else if (!isFullName(clientName)) missing.push("client_name (full first and last name)");
  if (!String(input.treatment ?? "").trim()) missing.push("treatment");
  if (!String(input.client_contact ?? "").trim()) missing.push("client_contact (phone)");
  if (!String(input.date_time ?? "").trim()) missing.push("date_time");
  if (!normalizeEmail(input.client_email)) missing.push("client_email");
  if (input.birthday_skipped === true || input.birthdaySkipped === true) {
    return "Birthday is required to book. Ask for the client's full date of birth (month, day, and year), save it via upsert_client, then pass birthday as YYYY-MM-DD in book_appointment.";
  }
  if (!hasValidBirthday(input)) {
    missing.push("birthday (required — YYYY-MM-DD, e.g. 1990-03-15)");
  }

  if (missing.length === 0) return null;
  if (!clientName) {
    return `Cannot book: missing required fields: ${missing.join(", ")}. Collect full name, phone, email, and birthday BEFORE saying "Locking in your appointment now!"`;
  }
  if (!isFullName(clientName)) {
    return `${fullNameValidationError("client_name")} ${missing.length > 1 ? `Also missing: ${missing.filter((m) => !m.startsWith("client_name")).join(", ")}.` : ""}`;
  }
  return `Cannot book: missing required fields: ${missing.join(", ")}. Collect full name, phone, email, and birthday BEFORE saying "Locking in your appointment now!"`;
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
}): string | null {
  const missing: string[] = [];
  const clientName = String(input.clientName ?? "").trim();
  if (!clientName) missing.push("client name");
  else if (!isFullName(clientName)) missing.push("client full name (first and last)");
  if (!String(input.treatment ?? "").trim()) missing.push("treatment");
  if (!String(input.clientContact ?? "").trim()) missing.push("phone");
  if (!normalizeEmail(input.clientEmail)) missing.push("email");
  if (!String(input.startTime ?? "").trim()) missing.push("appointment time");
  if (!String(input.endTime ?? "").trim()) missing.push("appointment end time");
  if (!String(input.practitionerName ?? "").trim()) missing.push("practitioner");
  if (!String(input.room ?? "").trim()) missing.push("room");
  if (!isValidBirthdayInput(input.birthday)) {
    missing.push("birthday (required)");
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

export function validateUpsertClientName(name: unknown): string | null {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "name is required";
  if (!isFullName(trimmed)) return fullNameValidationError("name");
  return null;
}

export async function enrichCancelRescheduleInput(input: Record<string, unknown>): Promise<void> {
  await enrichClientFromPhone(input);
}
