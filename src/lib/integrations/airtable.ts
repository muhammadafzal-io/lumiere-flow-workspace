import { getSupabase } from "@/lib/supabase";
import type { Client, Appointment } from "@/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function normalizeToDate(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function normalizeBirthday(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  if (/^\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{1,2}\/\d{1,2}$/.test(raw)) {
    const [m, d] = raw.split("/").map(Number);
    return `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const probe = new Date(raw.split("-").length === 2 ? `2000-${raw}` : raw);
  if (isNaN(probe.getTime())) return undefined;
  return [
    String(probe.getMonth() + 1).padStart(2, "0"),
    String(probe.getDate()).padStart(2, "0"),
  ].join("-");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── row → Client ────────────────────────────────────────────────────────────

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

// ─── exports ─────────────────────────────────────────────────────────────────

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
  const sb = getSupabase();
  const cutoff = new Date(Date.now() - daysThreshold * 24 * 60 * 60_000).toLocaleDateString(
    "en-CA",
    { timeZone: "America/Chicago" },
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

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
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

export async function upsertClient(data: Partial<Client> & { name: string }): Promise<Client> {
  const sb = getSupabase();
  const existing = await lookupClient({ telegramId: data.telegramId, phone: data.phone });

  const lastVisit = normalizeToDate(data.lastVisit);
  const birthday = normalizeBirthday(data.birthday);
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

// ─── credit code helpers ─────────────────────────────────────────────────────

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

export async function createAppointmentRecord(
  appt: Omit<Appointment, "id">,
  clientId?: string,
): Promise<void> {
  const sb = getSupabase();
  try {
    const { error } = await sb.from(APPT_TABLE).insert({
      "Client Name": appt.clientName,
      Treatment: appt.treatment,
      "Date & Time": appt.startTime,
      "End Time": appt.endTime,
      Status: "Confirmed",
      Contact: appt.clientContact,
      ...(appt.notes && { Notes: appt.notes }),
      ...(clientId && { client_id: clientId }),
    });
    if (error) console.error("createAppointmentRecord:", error.message);
  } catch {
    // non-fatal — calendar event already created
  }
}
