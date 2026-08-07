import { getSupabase } from "@/lib/supabase";
import { normalizeBirthdayForStorage } from "@/lib/birthday";
import type { Client, Appointment } from "@/types";
import { getClinicTimezone } from "@/lib/clinic-config";

async function normalizeToDate(raw: string | undefined): Promise<string | undefined> {
  if (!raw?.trim()) return undefined;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  const tz = await getClinicTimezone();
  return d.toLocaleDateString("en-CA", { timeZone: tz });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function rowToClient(row: Record<string, any>): Client {
  return {
    id: row.id,
    name: (row["Name"] ?? "").trim(),
    phone: row["Phone"] ?? undefined,
    email: row["Email"] ?? undefined,
    telegramId: row["Telegram ID"] ?? undefined,
    lastVisit: row["Last Visit"] ?? undefined,
    lastTreatment: row["Treatment Interest"] ?? undefined,
    status: (row["Status"] ?? "Active") as Client["status"],
    birthdayCreditCode: row["Credit Codes"] ?? undefined,
    birthday: row["Birthday"] ?? undefined,
    notes: row["Notes"] ?? undefined,
    lastReminderSent: row["Last Reminder Sent"] ?? undefined,
    lastReactivationSent: row["Last Reactivation Sent"] ?? undefined,
    reactivationStep: row["Reactivation Step"] ?? undefined,
    birthdayCreditSent: row["Birthday Credit Sent"] ?? undefined,
    appointments: row["Appointments"] ?? undefined,
  };
}

const TABLE = "Clients";
const APPT_TABLE = "Appointments";

export async function lookupClient(opts: {
  telegramId?: string;
  phone?: string;
}): Promise<Client | null> {
  const sb = getSupabase();
  const clauses: string[] = [];
  if (opts.telegramId) clauses.push(`"Telegram ID".eq.${opts.telegramId}`);
  if (opts.phone) clauses.push(`"Phone".eq.${opts.phone}`);
  if (!clauses.length) return null;

  let query = sb.from(TABLE).select("*").limit(1);
  if (opts.telegramId && opts.phone) {
    query = sb
      .from(TABLE)
      .select("*")
      .or(`"Telegram ID".eq.${opts.telegramId},"Phone".eq.${opts.phone}`)
      .limit(1);
  } else if (opts.telegramId) {
    query = sb.from(TABLE).select("*").eq("Telegram ID", opts.telegramId).limit(1);
  } else if (opts.phone) {
    query = sb.from(TABLE).select("*").eq("Phone", opts.phone).limit(1);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data?.length ? rowToClient(data[0]) : null;
}

export async function getDormantClients(daysThreshold = 90): Promise<Client[]> {
  const tz = await getClinicTimezone();
  const sb = getSupabase();
  const cutoff = new Date(Date.now() - daysThreshold * 24 * 60 * 60_000).toLocaleDateString(
    "en-CA",
    { timeZone: tz },
  );

  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .in("Status", ["Active", "Dormant"])
    .lt("Last Visit", cutoff);

  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToClient);
}

export async function getUpcomingBirthdays(daysAhead = 7): Promise<Client[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .not("Birthday", "is", null)
    .neq("Birthday", "");

  if (error) throw new Error(error.message);

  const tz = await getClinicTimezone();
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const [todayYear, todayMonth, todayDay] = todayStr.split("-").map(Number);
  const todayDate = new Date(todayYear, todayMonth - 1, todayDay);

  return (data ?? []).map(rowToClient).filter((client) => {
    if (!client.birthday) return false;
    const parts = client.birthday.split("-").map(Number);
    let month: number, day: number;
    if (parts.length === 3) {
      [, month, day] = parts;
    } else if (parts.length === 2) {
      [month, day] = parts;
    } else {
      return false;
    }
    let bdayDate = new Date(todayYear, month - 1, day);
    if (bdayDate < todayDate) bdayDate = new Date(todayYear + 1, month - 1, day);
    const daysUntil = (bdayDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysUntil >= 0 && daysUntil <= daysAhead;
  });
}

export async function getAllClients(): Promise<Client[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select("*");
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToClient);
}

export async function getClientById(id: string): Promise<Client | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToClient(data) : null;
}

export async function lookupClientByPhone(phone: string): Promise<Client | null> {
  const direct = await lookupClient({ phone }).catch(() => null);
  if (direct) return direct;

  const { phonesMatch } = await import("@/lib/phone");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;

  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select("*");
  if (error) throw new Error(error.message);

  const row = (data ?? []).find((r) => phonesMatch(String(r["Phone"] ?? ""), phone));
  return row ? rowToClient(row) : null;
}

export async function upsertClient(data: Partial<Client> & { name: string }): Promise<Client> {
  const sb = getSupabase();
  const existing = await lookupClient({ telegramId: data.telegramId, phone: data.phone });

  const lastVisit = await normalizeToDate(data.lastVisit);
  const birthday = normalizeBirthdayForStorage(data.birthday);
  const email = data.email && isValidEmail(data.email) ? data.email : undefined;

  const fields: Record<string, unknown> = {
    Name: data.name.trim(),
    ...(data.phone && { Phone: data.phone }),
    ...(email && { Email: email }),
    ...(data.telegramId && { "Telegram ID": data.telegramId }),
    ...(lastVisit && { "Last Visit": lastVisit }),
    ...(data.lastTreatment && { "Treatment Interest": data.lastTreatment }),
    ...(data.status && { Status: data.status }),
    ...(data.notes && { Notes: data.notes }),
    ...(birthday && { Birthday: birthday }),
    ...(data.appointments && { Appointments: data.appointments }),
  };

  if (existing?.id) {
    const { data: updated, error } = await sb
      .from(TABLE)
      .update(fields)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return rowToClient(updated);
  }

  const { data: created, error } = await sb.from(TABLE).insert(fields).select().single();
  if (error) throw new Error(error.message);
  return rowToClient(created);
}

export async function updateClientField(
  recordId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).update(fields).eq("id", recordId);
  if (error) throw new Error(error.message);
}

export interface CreditCodeInfo {
  raw: string;
  code: string;
  expiresAt: string | null;
  isUsed: boolean;
  isExpired: boolean;
  isValid: boolean;
  creditAmount: number;
  daysRemaining: number | null;
}

export function parseCreditCode(raw: string): CreditCodeInfo {
  const CREDIT_AMOUNT = 50;
  const withoutUsed = raw.startsWith("USED:") ? raw.slice(5) : raw;
  const [code, expiresAt = null] = withoutUsed.split("|");
  const isUsed = raw.startsWith("USED:");

  let isExpired = false;
  let daysRemaining: number | null = null;
  if (expiresAt) {
    const expiry = new Date(expiresAt);
    const now = new Date();
    daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    isExpired = daysRemaining < 0;
  }

  return {
    raw,
    code,
    expiresAt,
    isUsed,
    isExpired,
    isValid: !isUsed && !isExpired,
    creditAmount: CREDIT_AMOUNT,
    daysRemaining,
  };
}

export async function getClientByCreditCode(
  code: string,
): Promise<{ client: Client; codeInfo: CreditCodeInfo } | null> {
  const sb = getSupabase();

  // Match by display code (ignores USED: prefix and |expiry suffix)
  const { data, error } = await sb.from(TABLE).select("*").ilike("Credit Codes", `%${code}%`);
  if (error) throw new Error(error.message);
  if (!data?.length) return null;

  // Find exact match (code might partially match others)
  const row = data.find((r) => {
    const raw: string = r["Credit Codes"] ?? "";
    return parseCreditCode(raw).code === code;
  });
  if (!row) return null;

  return { client: rowToClient(row), codeInfo: parseCreditCode(row["Credit Codes"]) };
}

export async function redeemCreditCode(clientId: string, raw: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from(TABLE)
    .update({ "Credit Codes": `USED:${raw.replace(/^USED:/, "")}` })
    .eq("id", clientId);
  if (error) throw new Error(error.message);
}

export interface Practitioner {
  id: string;
  name: string;
  email?: string;
  role?: string;
  specialty?: string;
  bio?: string;
  calendarId?: string;
  status: "Active" | "Inactive";
}

function rowToPractitioner(row: Record<string, unknown>): Practitioner {
  return {
    id: String(row.id ?? ""),
    name: String(row["Name"] ?? "").trim(),
    email: (row["Email"] as string) ?? undefined,
    role: (row["Role"] as string) ?? undefined,
    specialty: (row["Specialty"] as string) ?? undefined,
    bio: (row["Bio"] as string) ?? undefined,
    calendarId: (row["Calendar ID"] as string) ?? undefined,
    status: (row["Status"] as "Active" | "Inactive") ?? "Active",
  };
}

export async function getPractitioners(filter?: { specialty?: string }): Promise<Practitioner[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("Practitioners").select("*").eq("Status", "Active");
  if (error) throw new Error(`getPractitioners: ${error.message}`);
  const all = (data ?? []).map((r) => rowToPractitioner(r as Record<string, unknown>));
  if (filter?.specialty) {
    const term = filter.specialty.toLowerCase();
    return all.filter((p) => p.specialty?.toLowerCase().includes(term));
  }
  return all;
}

export async function createAppointmentRecord(
  appt: Omit<Appointment, "id">,
  clientId?: string,
): Promise<void> {
  const sb = getSupabase();
  try {
    const { error } = await sb.from(APPT_TABLE).insert({
      client_name: appt.clientName,
      treatment: appt.treatment,
      start_time: appt.startTime,
      end_time: appt.endTime,
      status: "Confirmed",
      contact: appt.clientContact,
      ...(appt.notes && { notes: appt.notes }),
      ...(clientId && { client_id: clientId }),
    });
    if (error) console.error("createAppointmentRecord:", error.message);
  } catch {
    void 0;
  }
}
