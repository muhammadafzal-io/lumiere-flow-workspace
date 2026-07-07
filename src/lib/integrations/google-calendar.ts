import { google } from "googleapis";
import type { AvailableSlot, CalendarEvent, Appointment } from "@/types";
import {
  SLOT_BUFFER_MINUTES,
  SLOT_STEP_MINUTES,
  SLOT_BUFFER_MS,
  SLOT_STEP_MS,
  intervalsConflict,
} from "@/lib/booking/constants";
import { flowAsync, logFlowStep } from "@/lib/voice/flow-context";

const BUSINESS_START_HOUR = 9;
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

const EVENTS_RANGE_CACHE_MS = 45_000;
const eventsRangeCache = new Map<string, { at: number; events: CalendarEvent[] }>();

/** Clear cached calendar ranges after book/cancel/reschedule so lookups see fresh data. */
export function invalidateEventsRangeCache(): void {
  eventsRangeCache.clear();
}

// Returns today's date string (YYYY-MM-DD) in Chicago CT
function todayInChicago(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

// Converts a Chicago local time on a given date to a UTC Date.
// Supports fractional hours (e.g. 19.5 = 7:30 PM).
function chicagoHourToUtc(dateStr: string, hour: number): Date {
  let wholeHour = Math.floor(hour);
  let minutes = Math.round((hour - wholeHour) * 60);
  let datePart = dateStr;

  if (minutes >= 60) {
    wholeHour += 1;
    minutes = 0;
  }
  if (wholeHour >= 24) {
    const next = new Date(`${dateStr}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + Math.floor(wholeHour / 24));
    datePart = next.toISOString().slice(0, 10);
    wholeHour = wholeHour % 24;
  }

  const probe = new Date(
    `${datePart}T${String(wholeHour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00Z`,
  );
  if (isNaN(probe.getTime())) {
    throw new Error(`Invalid Chicago time for ${dateStr} at hour ${hour}`);
  }

  const localHour =
    parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: TIMEZONE,
        hour: "2-digit",
        hour12: false,
      }).format(probe),
      10,
    ) % 24;
  const localMinute = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      minute: "2-digit",
    }).format(probe),
    10,
  );
  const targetMinutes = wholeHour * 60 + minutes;
  const localMinutes = localHour * 60 + localMinute;
  return new Date(probe.getTime() + (targetMinutes - localMinutes) * 60_000);
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

const SUMMARY_SEP = " — ";

function parseEventSummary(summary: string): {
  treatment: string;
  clientName: string;
  practitionerName: string | null;
} {
  const parts = (summary ?? "")
    .split(SUMMARY_SEP)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    return {
      treatment: parts[0],
      practitionerName: parts.slice(1, -1).join(SUMMARY_SEP),
      clientName: parts[parts.length - 1],
    };
  }
  if (parts.length === 2) {
    return { treatment: parts[0], practitionerName: null, clientName: parts[1] };
  }
  return { treatment: "", practitionerName: null, clientName: parts[0] ?? "" };
}

function resolveEventClient(
  summary: string,
  description: string,
): { treatment: string; clientName: string } {
  const fromTitle = parseEventSummary(summary);
  const { client: fromDesc } = parseDesc(description);
  return {
    treatment: fromTitle.treatment,
    clientName: fromDesc || fromTitle.clientName,
  };
}

function parseDesc(description: string): {
  room: string | null;
  practitioner: string | null;
  client: string | null;
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
  const rawNotes = find("Notes:");
  const emailInNotes = rawNotes.match(/Email:\s*([^\s]+@[^\s]+)/i)?.[1] ?? "";
  return {
    room: find("Room:") || null,
    practitioner: find("Practitioner:") || null,
    client: find("Client:") || null,
    contact: find("Contact:"),
    email: find("Email:") || emailInNotes,
    notes: rawNotes,
  };
}

export async function getAvailableSlots(
  date: string,
  durationMinutes = 60,
  rooms: string[] = DEFAULT_ROOMS,
  practitionerNames: string[] = [],
): Promise<AvailableSlot[]> {
  logFlowStep("calendar:getAvailableSlots:start", { date, durationMinutes, rooms, practitionerNames });
  if (date < todayInChicago()) {
    logFlowStep("calendar:getAvailableSlots:end", { count: 0, reason: "past date" });
    return [];
  }

  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (dayOfWeek === 0) {
    logFlowStep("calendar:getAvailableSlots:end", { count: 0, reason: "sunday" });
    return [];
  }

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
    const blocks = Math.ceil(elapsed / SLOT_STEP_MS);
    cursor = new Date(dayStart.getTime() + blocks * SLOT_STEP_MS);
  }

  while (cursor.getTime() + durationMinutes * 60_000 <= dayEnd.getTime()) {
    const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000);

    // Events that conflict with this slot (including ${SLOT_BUFFER_MINUTES}-min turnover buffer)
    const conflicting = busyEvents.filter((b) =>
      intervalsConflict(cursor, slotEnd, b.start, b.end),
    );

    const hasGlobalEvent = conflicting.some((e) => e.room === null && e.practitioner === null);

    const busyRoomSet = new Set(conflicting.filter((e) => e.room !== null).map((e) => e.room!));
    const freeRooms = hasGlobalEvent ? [] : rooms.filter((r) => !busyRoomSet.has(r));

    const busyPracSet = new Set(
      conflicting.filter((e) => e.practitioner !== null).map((e) => e.practitioner!),
    );
    const freePractitioners = hasGlobalEvent
      ? []
      : practitionerNames.filter((p) => !busyPracSet.has(p));

    const roomAvailable = freeRooms.length > 0;
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

    cursor = new Date(cursor.getTime() + SLOT_STEP_MS);
  }

  logFlowStep("calendar:getAvailableSlots:end", { count: slots.length, date });
  return slots;
}

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
  return flowAsync("calendar:bookAdminAppointment", async () => {
    if (new Date(booking.startTime) < new Date()) {
      throw new Error("Cannot book an appointment in the past");
    }

    const calendar = getCalendarClient();
    const calId = calendarId();

    const bStart = new Date(booking.startTime);
    const bEnd = new Date(booking.endTime);

    const res = await calendar.events.list({
      calendarId: calId,
      timeMin: new Date(bStart.getTime() - SLOT_BUFFER_MS).toISOString(),
      timeMax: new Date(bEnd.getTime() + SLOT_BUFFER_MS).toISOString(),
      singleEvents: true,
    });

    logFlowStep("calendar:bookAdminAppointment conflict check", {
      overlappingEvents: (res.data.items ?? []).length,
    });

    const conflict = (res.data.items ?? []).find((e) => {
    if (!e.start?.dateTime || !e.end?.dateTime) return false;
    const eStart = new Date(e.start.dateTime);
    const eEnd = new Date(e.end.dateTime);
    if (!intervalsConflict(bStart, bEnd, eStart, eEnd)) return false;

    const { room: evRoom, practitioner: evPrac } = parseDesc(e.description ?? "");

    if (evRoom === null && evPrac === null) return true;

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

  invalidateEventsRangeCache();
  return { id: event.data.id! };
  }, {
    clientName: booking.clientName,
    treatment: booking.treatment,
    startTime: booking.startTime,
    room: booking.room,
    practitionerName: booking.practitionerName,
  });
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

  invalidateEventsRangeCache();
  return { ...appt, id: event.data.id! };
}

export async function getEventsByRange(from: string, to: string): Promise<CalendarEvent[]> {
  const cacheKey = `${from}|${to}`;
  const cached = eventsRangeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < EVENTS_RANGE_CACHE_MS) {
    return cached.events;
  }

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

  const events = (res.data.items ?? [])
    .filter((e) => e.start?.dateTime)
    .map((e) => {
      const { treatment, clientName } = resolveEventClient(e.summary ?? "", e.description ?? "");
      const { room, practitioner, contact, email, notes } = parseDesc(e.description ?? "");
      return {
        id: e.id!,
        treatment,
        clientName,
        startTime: e.start!.dateTime!,
        endTime: e.end!.dateTime ?? e.start!.dateTime!,
        clientContact: contact,
        clientEmail: email || undefined,
        notes,
        room: room ?? "",
        practitioner: practitioner ?? "",
      };
    });

  eventsRangeCache.set(cacheKey, { at: Date.now(), events });
  return events;
}

/** Cancel (delete) a calendar event by ID. Returns the event data before deletion. */
export async function cancelCalendarEvent(eventId: string): Promise<{
  clientName: string;
  treatment: string;
  clientContact: string;
  startTime: string;
}> {
  return flowAsync("calendar:cancelCalendarEvent", async () => {
    const calendar = getCalendarClient();
    const calId = calendarId();
    const { data: event } = await calendar.events.get({ calendarId: calId, eventId });
    logFlowStep("calendar:cancelCalendarEvent fetched", {
      summary: event.summary,
      start: event.start?.dateTime,
    });
    await calendar.events.delete({ calendarId: calId, eventId });
    invalidateEventsRangeCache();
    const { treatment, clientName } = resolveEventClient(
      event.summary ?? "",
      event.description ?? "",
    );
    const { contact } = parseDesc(event.description ?? "");
    return {
      clientName: clientName || "Client",
      treatment,
      clientContact: contact,
      startTime: event.start?.dateTime ?? "",
    };
  }, { eventId });
}

export type CalendarBookingDetails = {
  id: string;
  clientName: string;
  treatment: string;
  clientContact: string;
  clientEmail: string;
  startTime: string;
  endTime: string;
  practitionerName: string;
  room: string;
  notes: string;
};

export async function getCalendarBookingDetails(eventId: string): Promise<CalendarBookingDetails> {
  const calendar = getCalendarClient();
  const calId = calendarId();
  const { data: event } = await calendar.events.get({ calendarId: calId, eventId });
  const { treatment, clientName } = resolveEventClient(
    event.summary ?? "",
    event.description ?? "",
  );
  const parsed = parseDesc(event.description ?? "");
  const fromSummary = parseEventSummary(event.summary ?? "");
  return {
    id: eventId,
    clientName,
    treatment,
    clientContact: parsed.contact,
    clientEmail: parsed.email,
    startTime: event.start?.dateTime ?? "",
    endTime: event.end?.dateTime ?? "",
    practitionerName: parsed.practitioner ?? fromSummary.practitionerName ?? "",
    room: parsed.room ?? "",
    notes: parsed.notes,
  };
}

function setDescriptionEmail(description: string, email: string): string {
  const lines = description.split("\n");
  let found = false;
  const updated = lines.map((line) => {
    if (line.startsWith("Email:")) {
      found = true;
      return `Email: ${email}`;
    }
    return line;
  });
  if (!found) {
    const contactIdx = updated.findIndex((l) => l.startsWith("Contact:"));
    if (contactIdx >= 0) {
      updated.splice(contactIdx + 1, 0, `Email: ${email}`);
    } else {
      updated.push(`Email: ${email}`);
    }
  }
  return updated.join("\n");
}

export async function updateCalendarBookingEmail(eventId: string, email: string): Promise<void> {
  const calendar = getCalendarClient();
  const calId = calendarId();
  const { data: event } = await calendar.events.get({ calendarId: calId, eventId });
  await calendar.events.patch({
    calendarId: calId,
    eventId,
    requestBody: {
      description: setDescriptionEmail(event.description ?? "", email),
    },
  });
  invalidateEventsRangeCache();
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
  return flowAsync("calendar:rescheduleCalendarEvent", async () => {
    const calendar = getCalendarClient();
    const calId = calendarId();
    const { data: event } = await calendar.events.get({ calendarId: calId, eventId });
    const oldStartTime = event.start?.dateTime ?? "";
    logFlowStep("calendar:rescheduleCalendarEvent fetched", { oldStartTime, newStartTime });
    await calendar.events.update({
      calendarId: calId,
      eventId,
      requestBody: {
        ...event,
        start: { dateTime: newStartTime, timeZone: TIMEZONE },
        end: { dateTime: newEndTime, timeZone: TIMEZONE },
      },
    });
    invalidateEventsRangeCache();
    const { treatment, clientName } = resolveEventClient(
      event.summary ?? "",
      event.description ?? "",
    );
    const { contact } = parseDesc(event.description ?? "");
    return {
      clientName: clientName || "Client",
      treatment,
      clientContact: contact,
      oldStartTime,
      newStartTime,
    };
  }, { eventId, newStartTime, newEndTime });
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
      const { treatment, clientName } = resolveEventClient(e.summary ?? "", e.description ?? "");
      const { contact } = parseDesc(e.description ?? "");
      return {
        id: e.id!,
        treatment,
        clientName,
        startTime: e.start!.dateTime!,
        endTime: e.end!.dateTime ?? e.start!.dateTime!,
        clientContact: contact,
        confirmed: "pending",
      };
    });
}
