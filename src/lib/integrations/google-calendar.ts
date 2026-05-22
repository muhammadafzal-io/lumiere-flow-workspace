import { google } from "googleapis";
import type { AvailableSlot, Appointment } from "@/types";

const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 19;
const TIMEZONE = "America/Chicago";

// Returns today's date string (YYYY-MM-DD) in Austin CT
function todayInChicago(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

// Converts a Chicago local hour on a given date to a UTC Date.
// e.g. chicagoHourToUtc('2026-05-16', 9) → 14:00Z when CDT (UTC-5) is active
function chicagoHourToUtc(dateStr: string, hour: number): Date {
  const probe = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00Z`);
  const localHour =
    parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: TIMEZONE,
        hour: "2-digit",
        hour12: false,
      }).format(probe),
      10,
    ) % 24;
  return new Date(probe.getTime() + (hour - localHour) * 3_600_000);
}

function getCalendarClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

  let credentials: object;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID ?? "primary";
}

export async function getAvailableSlots(
  date: string,
  durationMinutes = 60,
): Promise<AvailableSlot[]> {
  // Never return slots for past dates (Austin CT)
  if (date < todayInChicago()) return [];

  const calendar = getCalendarClient();
  const calId = calendarId();

  const dayStart = chicagoHourToUtc(date, BUSINESS_START_HOUR);
  const dayEnd = chicagoHourToUtc(date, BUSINESS_END_HOUR);

  const res = await calendar.events.list({
    calendarId: calId,
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  const busyBlocks: Array<{ start: Date; end: Date }> = (res.data.items ?? [])
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({
      start: new Date(e.start!.dateTime!),
      end: new Date(e.end!.dateTime!),
    }));

  const now = new Date();
  const slots: AvailableSlot[] = [];

  // For today, start the cursor at the next 30-min boundary after now
  let cursor = new Date(dayStart);
  if (date === todayInChicago() && now > cursor) {
    const elapsed = now.getTime() - dayStart.getTime();
    const blocks = Math.ceil(elapsed / (30 * 60_000));
    cursor = new Date(dayStart.getTime() + blocks * 30 * 60_000);
  }

  while (cursor.getTime() + durationMinutes * 60_000 <= dayEnd.getTime()) {
    const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000);

    const overlaps = busyBlocks.some((b) => cursor < b.end && slotEnd > b.start);

    if (!overlaps) {
      slots.push({
        startTime: cursor.toISOString(),
        endTime: slotEnd.toISOString(),
        displayTime: cursor.toLocaleString("en-US", {
          timeZone: TIMEZONE,
          weekday: "long",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZoneName: "short",
        }),
      });
    }

    cursor = new Date(cursor.getTime() + 30 * 60_000);
  }

  return slots;
}

export async function createAppointment(appt: Omit<Appointment, "id">): Promise<Appointment> {
  if (new Date(appt.startTime) < new Date()) {
    throw new Error("Cannot book an appointment in the past");
  }

  const calendar = getCalendarClient();
  const calId = calendarId();

  const event = await calendar.events.insert({
    calendarId: calId,
    requestBody: {
      summary: `${appt.treatment} — ${appt.clientName}`,
      description: [
        `Treatment: ${appt.treatment}`,
        `Client: ${appt.clientName}`,
        `Contact: ${appt.clientContact}`,
        appt.notes ? `Notes: ${appt.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      start: { dateTime: appt.startTime, timeZone: TIMEZONE },
      end: { dateTime: appt.endTime, timeZone: TIMEZONE },
      colorId: "11",
    },
  });

  return { ...appt, id: event.data.id! };
}

export async function getUpcomingAppointments(daysAhead = 3): Promise<Appointment[]> {
  const calendar = getCalendarClient();
  const calId = calendarId();

  const now = new Date();
  const until = new Date(now.getTime() + daysAhead * 24 * 60 * 60_000);

  const res = await calendar.events.list({
    calendarId: calId,
    timeMin: now.toISOString(),
    timeMax: until.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return (res.data.items ?? [])
    .filter((e) => e.start?.dateTime)
    .map((e) => {
      const [treatment, clientName] = (e.summary ?? "").split(" — ");
      const descLines = (e.description ?? "").split("\n");
      const contact =
        descLines
          .find((l) => l.startsWith("Contact:"))
          ?.replace("Contact:", "")
          .trim() ?? "";
      return {
        id: e.id!,
        treatment: treatment?.trim() ?? "",
        clientName: clientName?.trim() ?? "",
        startTime: e.start!.dateTime!,
        endTime: e.end!.dateTime ?? e.start!.dateTime!,
        clientContact: contact,
        confirmed: "pending",
      };
    });
}
