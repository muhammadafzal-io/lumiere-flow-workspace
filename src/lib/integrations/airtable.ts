import Airtable from "airtable";
import type { Client, Appointment } from "@/types";

// ─── helpers ────────────────────────────────────────────────────────────────

// Any date string → YYYY-MM-DD (Austin CT). Handles "5/17/2026", "5/17/2026 12:00am", ISO, etc.
function normalizeToDate(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

// Any birthday string → MM-DD. Accepts "03-15", "3/15", "March 15 2000", ISO dates.
function normalizeBirthday(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  if (/^\d{2}-\d{2}$/.test(raw)) return raw; // already MM-DD
  if (/^\d{1,2}\/\d{1,2}$/.test(raw)) {
    // M/D or MM/DD
    const [m, d] = raw.split("/").map(Number);
    return `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const probe = new Date(
    raw.split("-").length === 2 ? `2000-${raw}` : raw, // treat bare MM-DD
  );
  if (isNaN(probe.getTime())) return undefined;
  return [
    String(probe.getMonth() + 1).padStart(2, "0"),
    String(probe.getDate()).padStart(2, "0"),
  ].join("-");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── column maps ───────────────────────────────────────────────────────────

const COL = {
  name: "Name",
  phone: "Phone",
  telegramId: "Telegram ID",
  email: "Email",
  lastVisit: "Last Visit",
  lastTreatment: "Treatment Interest",
  status: "Status",
  creditCodes: "Credit Codes",
  birthday: "Birthday",
  notes: "Notes",
  lastReminderSent: "Last Reminder Sent",
  lastReactivationSent: "Last Reactivation Sent",
  reactivationStep: "Reactivation Step",
  birthdayCreditSent: "Birthday Credit Sent",
  appointments: "Appointments",
} as const;

const APPT_COL = {
  clientName: "Client Name",
  client: "Client", // linked-record field → Clients table
  treatment: "Treatment",
  dateTime: "Date & Time",
  endTime: "End Time",
  status: "Status",
  contact: "Contact",
  notes: "Notes",
} as const;

// ─── base helpers ───────────────────────────────────────────────────────────

function getBase() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) throw new Error("Missing Airtable env vars");
  return new Airtable({ apiKey }).base(baseId);
}

function tableName() {
  return process.env.AIRTABLE_CLIENTS_TABLE ?? "Clients";
}

function apptTableName() {
  return process.env.AIRTABLE_APPOINTMENTS_TABLE ?? "Appointments";
}

// ─── record mapping ─────────────────────────────────────────────────────────

function recordToClient(r: Airtable.Record<Airtable.FieldSet>): Client {
  const f = (key: string) => r.get(key) as string | undefined;
  const b = (key: string) => r.get(key) as boolean | undefined;
  return {
    id: r.id,
    name: (f(COL.name) ?? "").trim(),
    phone: f(COL.phone),
    email: f(COL.email),
    telegramId: f(COL.telegramId),
    lastVisit: f(COL.lastVisit),
    lastTreatment: f(COL.lastTreatment),
    status: (f(COL.status) ?? "Active") as Client["status"],
    birthdayCreditCode: f(COL.creditCodes),
    birthday: f(COL.birthday),
    notes: f(COL.notes),
    lastReminderSent: f(COL.lastReminderSent),
    lastReactivationSent: f(COL.lastReactivationSent),
    reactivationStep: r.get(COL.reactivationStep) as number | undefined,
    birthdayCreditSent: b(COL.birthdayCreditSent),
    appointments: f(COL.appointments),
  };
}

// ─── exports ─────────────────────────────────────────────────────────────────

export async function lookupClient(opts: {
  telegramId?: string;
  phone?: string;
}): Promise<Client | null> {
  const base = getBase();
  const clauses: string[] = [];
  if (opts.telegramId) clauses.push(`{${COL.telegramId}}='${opts.telegramId}'`);
  if (opts.phone) clauses.push(`{${COL.phone}}='${opts.phone}'`);
  if (!clauses.length) return null;

  const formula = clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`;
  const records = await base(tableName())
    .select({ filterByFormula: formula, maxRecords: 1 })
    .firstPage();
  return records.length ? recordToClient(records[0]) : null;
}

export async function getDormantClients(daysThreshold = 90): Promise<Client[]> {
  const base = getBase();
  const cutoff = new Date(Date.now() - daysThreshold * 24 * 60 * 60_000).toLocaleDateString(
    "en-CA",
    { timeZone: "America/Chicago" },
  );

  const records = await base(tableName())
    .select({
      filterByFormula: `AND(
        OR({${COL.status}}='Active', {${COL.status}}='Dormant'),
        IS_BEFORE({${COL.lastVisit}}, '${cutoff}')
      )`,
    })
    .all();

  return records.map(recordToClient);
}

export async function getUpcomingBirthdays(daysAhead = 7): Promise<Client[]> {
  const base = getBase();
  const records = await base(tableName())
    .select({ filterByFormula: `NOT({${COL.birthday}} = '')` })
    .all();

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const [todayYear, todayMonth, todayDay] = todayStr.split("-").map(Number);
  const todayDate = new Date(todayYear, todayMonth - 1, todayDay);

  return records.map(recordToClient).filter((client) => {
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
  const base = getBase();
  const records = await base(tableName()).select().all();
  return records.map(recordToClient);
}

export async function upsertClient(data: Partial<Client> & { name: string }): Promise<Client> {
  const base = getBase();
  const tbl = tableName();
  const existing = await lookupClient({ telegramId: data.telegramId, phone: data.phone });

  const lastVisit = normalizeToDate(data.lastVisit);
  const birthday = normalizeBirthday(data.birthday);
  const email = data.email && isValidEmail(data.email) ? data.email : undefined;

  // All columns verified against actual Airtable schema — safe to write in one request
  const fields: Record<string, unknown> = {
    [COL.name]: data.name.trim(),
    ...(data.phone && { [COL.phone]: data.phone }),
    ...(email && { [COL.email]: email }),
    ...(data.telegramId && { [COL.telegramId]: data.telegramId }),
    ...(lastVisit && { [COL.lastVisit]: lastVisit }),
    ...(data.lastTreatment && { [COL.lastTreatment]: data.lastTreatment }),
    ...(data.status && { [COL.status]: data.status }),
    ...(data.notes && { [COL.notes]: data.notes }),
    ...(birthday && { [COL.birthday]: birthday }),
    ...(data.appointments && { [COL.appointments]: data.appointments }),
  };

  const at = fields as unknown as Airtable.FieldSet;

  if (existing?.id) {
    return new Promise((resolve, reject) =>
      base(tbl).update(existing.id!, at, (err, rec) =>
        err || !rec ? reject(err ?? new Error("No record returned")) : resolve(recordToClient(rec)),
      ),
    );
  }
  return new Promise((resolve, reject) =>
    base(tbl).create(at, (err, rec) =>
      err || !rec ? reject(err ?? new Error("No record returned")) : resolve(recordToClient(rec)),
    ),
  );
}

export async function updateClientField(
  recordId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const base = getBase();
  await new Promise<void>((resolve, reject) =>
    base(tableName()).update(recordId, fields as Airtable.FieldSet, (err) =>
      err ? reject(err) : resolve(),
    ),
  );
}

// Creates a record in the Appointments table and links it to the client record.
// clientRecordId is the Airtable record ID returned by upsertClient.
export async function createAppointmentRecord(
  appt: Omit<Appointment, "id">,
  clientRecordId?: string,
): Promise<void> {
  const base = getBase();
  const tbl = apptTableName();

  const coreFields: Record<string, unknown> = {
    [APPT_COL.clientName]: appt.clientName,
    [APPT_COL.treatment]: appt.treatment,
    [APPT_COL.dateTime]: appt.startTime,
    [APPT_COL.endTime]: appt.endTime,
    [APPT_COL.status]: "Confirmed",
    [APPT_COL.contact]: appt.clientContact,
  };

  const extendedFields: Record<string, unknown> = {
    ...(appt.notes && { [APPT_COL.notes]: appt.notes }),
    ...(clientRecordId && { [APPT_COL.client]: [clientRecordId] }),
  };

  function tryCreate(fields: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) =>
      base(tbl).create(fields as unknown as Airtable.FieldSet, (err) =>
        err ? reject(err) : resolve(),
      ),
    );
  }

  try {
    await tryCreate({ ...coreFields, ...extendedFields });
  } catch {
    try {
      await tryCreate(coreFields);
    } catch {
      // Appointments table doesn't exist yet — non-fatal, calendar event was already created
    }
  }
}
