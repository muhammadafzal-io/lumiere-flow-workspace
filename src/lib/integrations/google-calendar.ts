import { google } from "googleapis";
import type { AvailableSlot, CalendarEvent, Appointment } from "@/types";

const BUSINESS_START_HOUR = 9;
// Appointments can start up to 7 PM (last slot ends at 7:30 PM for 30-min treatments).
// The clinic's posted closing time is 7 PM but staff close out after the last client.
const BUSINESS_END_HOUR = 19.5;
const TIMEZONE = "America/Chicago";

function getDefaultRooms(): string[] {
  const roomsEnv = process.env.CLINIC_ROOMS;
  if (roomsEnv) {
    return roomsEnv
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
  }
  return ["Room 1", "Room 2"];
}

const DEFAULT_ROOMS = getDefaultRooms();

// Returns today's date string (YYYY-MM-DD) in Chicago CT
function todayInChicago(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

// Converts a Chicago local hour on a given date to a UTC Date.
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

// Parses Room, Practitioner, Contact, Email, Notes from a GCal event description.
// Returns null for room/practitioner if not present (legacy events without these fields).
function parseDesc(description: string): {
  room: string | null;
  practitioner: string | null;
  contact: string;
  email: string;
  notes: string;
} {
  const lines = description.split("\n");
  const find = (prefix: string) =>
    lines
      .find((l) => l.startsWith(prefix))
      ?.slice(prefix.length)
      .trim() ?? "";
  // Also check for "Email: ..." pattern inside the Notes field as fallback
  const rawNotes = find("Notes:");
  const emailInNotes = rawNotes.match(/Email:\s*([^\s]+@[^\s]+)/i)?.[1] ?? "";
  return {
    room: find("Room:") || null,
    practitioner: find("Practitioner:") || null,
    contact: find("Contact:"),
    email: find("Email:") || emailInNotes,
    notes: rawNotes,
  };
}

// ── Available slots (per-room, per-practitioner aware) ───────────────────────

export async function getAvailableSlots(
  date: string,
  durationMinutes = 60,
  rooms: string[] = DEFAULT_ROOMS,
  practitionerNames: string[] = [],
): Promise<AvailableSlot[]> {
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

  type BusyEvent = { start: Date; end: Date; room: string | null; practitioner: string | null };

  const busyEvents: BusyEvent[] = (res.data.items ?? [])
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .map((e) => {
      const { room, practitioner } = parseDesc(e.description ?? "");
      return {
        start: new Date(e.start!.dateTime!),
        end: new Date(e.end!.dateTime!),
        room,
        practitioner,
      };
    });

  const now = new Date();
  const slots: AvailableSlot[] = [];

  let cursor = new Date(dayStart);
  if (date === todayInChicago() && now > cursor) {
    const elapsed = now.getTime() - dayStart.getTime();
    const blocks = Math.ceil(elapsed / (30 * 60_000));
    cursor = new Date(dayStart.getTime() + blocks * 30 * 60_000);
  }

  while (cursor.getTime() + durationMinutes * 60_000 <= dayEnd.getTime()) {
    const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000);

    // Events that overlap this candidate slot
    const overlapping = busyEvents.filter((b) => cursor < b.end && slotEnd > b.start);

    // A "global" event (no room AND no practitioner stored) is a legacy event
    // that blocks everything — treat conservatively.
    const hasGlobalEvent = overlapping.some((e) => e.room === null && e.practitioner === null);

    // Rooms busy = rooms explicitly claimed by an overlapping event
    const busyRoomSet = new Set(overlapping.filter((e) => e.room !== null).map((e) => e.room!));
    const freeRooms = hasGlobalEvent ? [] : rooms.filter((r) => !busyRoomSet.has(r));

    // Practitioners busy = practitioners explicitly claimed by an overlapping event
    const busyPracSet = new Set(
      overlapping.filter((e) => e.practitioner !== null).map((e) => e.practitioner!),
    );
    const freePractitioners = hasGlobalEvent
      ? []
      : practitionerNames.filter((p) => !busyPracSet.has(p));

    const roomAvailable = freeRooms.length > 0;
    // Skip practitioner gating if caller didn't supply practitioner names
    const pracAvailable = practitionerNames.length === 0 || freePractitioners.length > 0;

    if (roomAvailable && pracAvailable) {
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
        availableRooms: freeRooms,
        availablePractitioners: freePractitioners,
      });
    }

    cursor = new Date(cursor.getTime() + 30 * 60_000);
  }

  return slots;
}

// ── Admin booking with per-room + per-practitioner conflict check ────────────

export async function bookAdminAppointment(booking: {
  startTime: string;
  endTime: string;
  clientName: string;
  clientContact?: string;
  clientEmail?: string;
  treatment: string;
  room: string;
  practitionerName: string;
  notes?: string;
}): Promise<{ id: string }> {
  if (new Date(booking.startTime) < new Date()) {
    throw new Error("Cannot book an appointment in the past");
  }

  const calendar = getCalendarClient();
  const calId = calendarId();

  // Fetch all events that overlap the requested window
  const res = await calendar.events.list({
    calendarId: calId,
    timeMin: booking.startTime,
    timeMax: booking.endTime,
    singleEvents: true,
  });

  const bStart = new Date(booking.startTime);
  const bEnd = new Date(booking.endTime);

  const conflict = (res.data.items ?? []).find((e) => {
    if (!e.start?.dateTime || !e.end?.dateTime) return false;
    const eStart = new Date(e.start.dateTime);
    const eEnd = new Date(e.end.dateTime);
    if (eStart >= bEnd || eEnd <= bStart) return false;

    const { room: evRoom, practitioner: evPrac } = parseDesc(e.description ?? "");

    // Legacy event (no metadata) blocks everything
    if (evRoom === null && evPrac === null) return true;

    // Conflict if new booking shares the same room OR the same practitioner
    const roomConflict = evRoom === null || evRoom === booking.room;
    const pracConflict = evPrac === null || evPrac === booking.practitionerName;
    return roomConflict && pracConflict;
  });

  if (conflict) {
    const { room: evRoom, practitioner: evPrac } = parseDesc(conflict.description ?? "");
    if (evRoom === booking.room && evPrac === booking.practitionerName) {
      throw new Error(
        `${booking.room} with ${booking.practitionerName} is already booked at this time`,
      );
    } else if (evRoom === booking.room) {
      throw new Error(`${booking.room} is already booked — try a different room`);
    } else if (evPrac === booking.practitionerName) {
      throw new Error(
        `${booking.practitionerName} is already booked — try a different practitioner`,
      );
    } else {
      throw new Error("This time slot is unavailable — try a different room or practitioner");
    }
  }

  const event = await calendar.events.insert({
    calendarId: calId,
    requestBody: {
      summary: `${booking.treatment} — ${booking.clientName}`,
      description: [
        `Treatment: ${booking.treatment}`,
        `Client: ${booking.clientName}`,
        `Contact: ${booking.clientContact ?? ""}`,
        booking.clientEmail ? `Email: ${booking.clientEmail}` : "",
        `Room: ${booking.room}`,
        `Practitioner: ${booking.practitionerName}`,
        booking.notes ? `Notes: ${booking.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      start: { dateTime: booking.startTime, timeZone: TIMEZONE },
      end: { dateTime: booking.endTime, timeZone: TIMEZONE },
      colorId: "11",
    },
  });

  return { id: event.data.id! };
}

// ── Legacy AI-agent booking (unchanged) ─────────────────────────────────────

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
        appt.clientEmail ? `Email: ${appt.clientEmail}` : "",
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

// ── Fetch events by date range ───────────────────────────────────────────────

export async function getEventsByRange(from: string, to: string): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient();
  const calId = calendarId();
  const timeMin = chicagoHourToUtc(from, 0).toISOString();
  const timeMax = chicagoHourToUtc(to, 24).toISOString();

  const res = await calendar.events.list({
    calendarId: calId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  return (res.data.items ?? [])
    .filter((e) => e.start?.dateTime)
    .map((e) => {
      const summary = e.summary ?? "";
      const dashIdx = summary.indexOf(" — ");
      const treatment = dashIdx >= 0 ? summary.slice(0, dashIdx).trim() : "";
      const clientName = dashIdx >= 0 ? summary.slice(dashIdx + 3).trim() : summary.trim();
      const { room, practitioner, contact, notes } = parseDesc(e.description ?? "");
      return {
        id: e.id!,
        treatment,
        clientName,
        startTime: e.start!.dateTime!,
        endTime: e.end!.dateTime ?? e.start!.dateTime!,
        clientContact: contact,
        notes,
        room: room ?? "",
        practitioner: practitioner ?? "",
      };
    });
}

/** Cancel (delete) a calendar event by ID. Returns the event data before deletion. */
export async function cancelCalendarEvent(eventId: string): Promise<{
  clientName: string;
  treatment: string;
  clientContact: string;
  startTime: string;
}> {
  const calendar = getCalendarClient();
  const calId = calendarId();
  const { data: event } = await calendar.events.get({ calendarId: calId, eventId });
  await calendar.events.delete({ calendarId: calId, eventId });
  const summary = event.summary ?? "";
  const dashIdx = summary.indexOf(" — ");
  const treatment = dashIdx >= 0 ? summary.slice(0, dashIdx).trim() : summary;
  const clientName = dashIdx >= 0 ? summary.slice(dashIdx + 3).trim() : "Client";
  const { contact } = parseDesc(event.description ?? "");
  return {
    clientName,
    treatment,
    clientContact: contact,
    startTime: event.start?.dateTime ?? "",
  };
}

/** Reschedule a calendar event to a new start/end time. Returns old and new start times. */
export async function rescheduleCalendarEvent(
  eventId: string,
  newStartTime: string,
  newEndTime: string,
): Promise<{
  clientName: string;
  treatment: string;
  clientContact: string;
  oldStartTime: string;
  newStartTime: string;
}> {
  const calendar = getCalendarClient();
  const calId = calendarId();
  const { data: event } = await calendar.events.get({ calendarId: calId, eventId });
  const oldStartTime = event.start?.dateTime ?? "";
  await calendar.events.update({
    calendarId: calId,
    eventId,
    requestBody: {
      ...event,
      start: { dateTime: newStartTime, timeZone: TIMEZONE },
      end: { dateTime: newEndTime, timeZone: TIMEZONE },
    },
  });
  const summary = event.summary ?? "";
  const dashIdx = summary.indexOf(" — ");
  const treatment = dashIdx >= 0 ? summary.slice(0, dashIdx).trim() : summary;
  const clientName = dashIdx >= 0 ? summary.slice(dashIdx + 3).trim() : "Client";
  const { contact } = parseDesc(event.description ?? "");
  return { clientName, treatment, clientContact: contact, oldStartTime, newStartTime };
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
      const { contact } = parseDesc(e.description ?? "");
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
