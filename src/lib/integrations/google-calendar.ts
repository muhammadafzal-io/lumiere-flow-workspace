import { google, type calendar_v3 } from "googleapis";
import type { AvailableSlot, CalendarEvent, Appointment } from "@/types";
import {
  SLOT_BUFFER_MINUTES,
  SLOT_STEP_MS,
  intervalsConflict,
  intervalsOverlap,
} from "@/lib/booking/constants";
import { getClinicTimezone } from "@/lib/clinic-timezone";
import {
  getClinicBusinessHours,
  hoursForWeekday,
  WEEKDAY_BY_UTC_DAY,
} from "@/lib/booking/clinic-hours";

/**
 * Resource-specific scheduling data resolved from a Service's recipe (Rooms/Equipment/
 * Practitioners tables) for one calendar date. When provided, `getAvailableSlots` and
 * `bookAdminAppointment` use these per-resource cleanup buffers and hard exclusions
 * (closed times, time off, outside working hours) instead of the flat legacy defaults.
 */
export interface ResourceAvailabilityContext {
  roomCleanupMinutes?: Record<string, number>;
  roomExtraBusy?: Record<string, { start: Date; end: Date }[]>;
  equipmentCleanupMinutes?: Record<string, number>;
  equipmentExtraBusy?: Record<string, { start: Date; end: Date }[]>;
  practitionerExtraBusy?: Record<string, { start: Date; end: Date }[]>;
}

function resourceExtraBusyConflict(
  extraBusy: { start: Date; end: Date }[] | undefined,
  start: Date,
  end: Date,
): boolean {
  return !!extraBusy?.some((b) => intervalsOverlap(start, end, b.start, b.end));
}

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

type EventWithDateTimes = calendar_v3.Schema$Event & {
  start: { dateTime: string };
  end: { dateTime: string };
};

type EventWithStartTime = calendar_v3.Schema$Event & { start: { dateTime: string } };

function isCalendarEventWithDateTimes(
  e: calendar_v3.Schema$Event | null | undefined,
): e is EventWithDateTimes {
  return !!e?.start?.dateTime && !!e.end?.dateTime;
}

function isCalendarEventWithStartTime(
  e: calendar_v3.Schema$Event | null | undefined,
): e is EventWithStartTime {
  return !!e?.start?.dateTime;
}

// Returns today's date string (YYYY-MM-DD) in the given timezone
function todayInZone(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

// Converts a local time (in the given IANA timezone) on a given date to a UTC Date.
// Supports fractional hours (e.g. 19.5 = 7:30 PM).
export function zonedHourToUtc(dateStr: string, hour: number, timezone: string): Date {
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
    throw new Error(`Invalid ${timezone} time for ${dateStr} at hour ${hour}`);
  }

  const localHour =
    parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        hour12: false,
      }).format(probe),
      10,
    ) % 24;
  const localMinute = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      minute: "2-digit",
    }).format(probe),
    10,
  );
  const targetMinutes = wholeHour * 60 + minutes;
  const localMinutes = localHour * 60 + localMinute;
  // Fold into the smallest-magnitude correction (-720, 720] minutes. Without this, a positive-offset
  // timezone (e.g. UTC+5) whose local reading of `probe` has already rolled past midnight — as happens
  // for BUSINESS_END_HOUR=19.5 there, since 19:30 UTC reads as 00:30 the next day locally — picks the
  // +23h20m raw difference instead of the equivalent -5h, silently shifting the result a full day later.
  let diff = targetMinutes - localMinutes;
  diff = ((((diff + 720) % 1440) + 1440) % 1440) - 720;
  return new Date(probe.getTime() + diff * 60_000);
}

/** Convenience wrapper for an "HH:MM" wall-clock string instead of a fractional hour. */
export function zonedDateTimeToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  return zonedHourToUtc(dateStr, h + (m || 0) / 60, timezone);
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
  equipment: string[];
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
  const findAll = (prefix: string) =>
    lines
      .filter((l) => l.startsWith(prefix))
      .map((l) => l.slice(prefix.length).trim())
      .filter(Boolean);
  const rawNotes = find("Notes:");
  const emailInNotes = rawNotes.match(/Email:\s*([^\s]+@[^\s]+)/i)?.[1] ?? "";
  return {
    room: find("Room:") || null,
    practitioner: find("Practitioner:") || null,
    equipment: findAll("Equipment:"),
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
  equipmentNames: string[] = [],
  context?: ResourceAvailabilityContext,
  /** When set, each group means "need one free item from this group" (OR within a group, AND across groups) — used for a service's equipment requirement rows instead of the legacy flat AND-all-of `equipmentNames` semantics. */
  equipmentRequirementGroups?: string[][],
  /** Clinic's configured IANA timezone (Settings > Clinic info). Fetched automatically when omitted. */
  timezone?: string,
): Promise<AvailableSlot[]> {
  const tz = timezone ?? (await getClinicTimezone());

  if (date < todayInZone(tz)) return [];

  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
  const schedule = await getClinicBusinessHours();
  const todayHours = hoursForWeekday(schedule, WEEKDAY_BY_UTC_DAY[dayOfWeek]);
  if (!todayHours) return []; // clinic is closed this weekday, per the configured schedule

  const calendar = getCalendarClient();
  const calId = calendarId();

  const dayStart = zonedHourToUtc(date, todayHours.startHour, tz);
  const dayEnd = zonedHourToUtc(date, todayHours.endHour, tz);

  const res = await calendar.events.list({
    calendarId: calId,
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  type BusyEvent = {
    start: Date;
    end: Date;
    room: string | null;
    practitioner: string | null;
    equipment: string[];
  };

  const busyEvents: BusyEvent[] = (res.data.items ?? [])
    .filter(isCalendarEventWithDateTimes)
    .map((e) => {
      const { room, practitioner, equipment } = parseDesc(e.description ?? "");
      return {
        start: new Date(e.start.dateTime),
        end: new Date(e.end.dateTime),
        room,
        practitioner,
        equipment,
      };
    });

  const now = new Date();
  const slots: AvailableSlot[] = [];

  let cursor = new Date(dayStart);
  if (date === todayInZone(tz) && now > cursor) {
    // Add a few minutes of lead time so the very first offered slot doesn't go stale by the
    // time a conversation (chat/voice round-trips) actually reaches booking confirmation.
    const MIN_LEAD_MS = 3 * 60_000;
    const elapsed = now.getTime() - dayStart.getTime() + MIN_LEAD_MS;
    const blocks = Math.ceil(elapsed / SLOT_STEP_MS);
    cursor = new Date(dayStart.getTime() + blocks * SLOT_STEP_MS);
  }

  const roomBuffer = (name: string) => context?.roomCleanupMinutes?.[name] ?? SLOT_BUFFER_MINUTES;
  const equipmentBuffer = (name: string) =>
    context?.equipmentCleanupMinutes?.[name] ?? SLOT_BUFFER_MINUTES;
  // Practitioners are always free the moment an appointment ends (PRD §5/§7) once we're in
  // recipe-aware mode; legacy (no-context) callers keep the old flat turnover buffer.
  const practitionerBuffer = context ? 0 : SLOT_BUFFER_MINUTES;

  const isEquipmentFree = (eq: string, start: Date, end: Date) => {
    const calendarBusy = busyEvents.some(
      (e) =>
        e.equipment.includes(eq) &&
        intervalsConflict(start, end, e.start, e.end, equipmentBuffer(eq)),
    );
    if (calendarBusy) return false;
    return !resourceExtraBusyConflict(context?.equipmentExtraBusy?.[eq], start, end);
  };

  while (cursor.getTime() + durationMinutes * 60_000 <= dayEnd.getTime()) {
    const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000);

    const hasGlobalEvent = busyEvents.some(
      (e) =>
        e.room === null &&
        e.practitioner === null &&
        e.equipment.length === 0 &&
        intervalsConflict(cursor, slotEnd, e.start, e.end, SLOT_BUFFER_MINUTES),
    );

    const freeRooms = hasGlobalEvent
      ? []
      : rooms.filter((r) => {
          const calendarBusy = busyEvents.some(
            (e) =>
              e.room === r && intervalsConflict(cursor, slotEnd, e.start, e.end, roomBuffer(r)),
          );
          if (calendarBusy) return false;
          return !resourceExtraBusyConflict(context?.roomExtraBusy?.[r], cursor, slotEnd);
        });

    const freePractitioners = hasGlobalEvent
      ? []
      : practitionerNames.filter((p) => {
          const calendarBusy = busyEvents.some(
            (e) =>
              e.practitioner === p &&
              intervalsConflict(cursor, slotEnd, e.start, e.end, practitionerBuffer),
          );
          if (calendarBusy) return false;
          return !resourceExtraBusyConflict(context?.practitionerExtraBusy?.[p], cursor, slotEnd);
        });

    let freeEquipment: string[];
    let equipmentAvailable: boolean;
    if (equipmentRequirementGroups && equipmentRequirementGroups.length > 0) {
      const chosen: string[] = [];
      equipmentAvailable =
        !hasGlobalEvent &&
        equipmentRequirementGroups.every((group) => {
          const free = group.find((eq) => isEquipmentFree(eq, cursor, slotEnd));
          if (free) chosen.push(free);
          return !!free;
        });
      freeEquipment = chosen;
    } else {
      freeEquipment = hasGlobalEvent
        ? []
        : equipmentNames.filter((eq) => isEquipmentFree(eq, cursor, slotEnd));
      equipmentAvailable =
        equipmentNames.length === 0 || freeEquipment.length === equipmentNames.length;
    }

    const roomAvailable = freeRooms.length > 0;
    const pracAvailable = practitionerNames.length === 0 || freePractitioners.length > 0;

    if (roomAvailable && pracAvailable && equipmentAvailable) {
      slots.push({
        startTime: cursor.toISOString(),
        endTime: slotEnd.toISOString(),
        displayTime: cursor.toLocaleString("en-US", {
          timeZone: tz,
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
        availableEquipment:
          equipmentNames.length > 0 || (equipmentRequirementGroups?.length ?? 0) > 0
            ? freeEquipment
            : undefined,
      });
    }

    cursor = new Date(cursor.getTime() + SLOT_STEP_MS);
  }

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
  equipment?: string[];
  notes?: string;
  /** Per-resource cleanup minutes resolved from the service's recipe; defaults to the flat SLOT_BUFFER_MINUTES when omitted (legacy behavior). */
  roomCleanupMinutes?: number;
  equipmentCleanupMinutes?: number;
  /** Manual override (PRD §9) — when true, skip the conflict throw below and book anyway. */
  force?: boolean;
  /** Clinic's configured IANA timezone (Settings > Clinic info). Fetched automatically when omitted. */
  timezone?: string;
}): Promise<{ id: string }> {
  if (new Date(booking.startTime) < new Date()) {
    throw new Error("Cannot book an appointment in the past");
  }

  const tz = booking.timezone ?? (await getClinicTimezone());
  const calendar = getCalendarClient();
  const calId = calendarId();

  const bStart = new Date(booking.startTime);
  const bEnd = new Date(booking.endTime);

  const isRecipeAware =
    booking.roomCleanupMinutes !== undefined || booking.equipmentCleanupMinutes !== undefined;
  const roomBufferMin = booking.roomCleanupMinutes ?? SLOT_BUFFER_MINUTES;
  const equipmentBufferMin = booking.equipmentCleanupMinutes ?? SLOT_BUFFER_MINUTES;
  // Practitioners are always free the moment an appointment ends (PRD §5/§7) once we're in
  // recipe-aware mode; legacy callers keep the old flat turnover buffer.
  const practitionerBufferMin = isRecipeAware ? 0 : SLOT_BUFFER_MINUTES;
  const maxBufferMs = Math.max(roomBufferMin, equipmentBufferMin, practitionerBufferMin) * 60_000;

  // Fetch events that could conflict including turnover buffer
  const res = await calendar.events.list({
    calendarId: calId,
    timeMin: new Date(bStart.getTime() - maxBufferMs).toISOString(),
    timeMax: new Date(bEnd.getTime() + maxBufferMs).toISOString(),
    singleEvents: true,
  });

  const conflict = (res.data.items ?? []).find((e) => {
    if (!e.start?.dateTime || !e.end?.dateTime) return false;
    const eStart = new Date(e.start.dateTime);
    const eEnd = new Date(e.end.dateTime);

    const {
      room: evRoom,
      practitioner: evPrac,
      equipment: evEquip,
    } = parseDesc(e.description ?? "");

    if (evRoom === null && evPrac === null && evEquip.length === 0) {
      return intervalsConflict(bStart, bEnd, eStart, eEnd, SLOT_BUFFER_MINUTES);
    }

    const roomConflict =
      evRoom !== null &&
      evRoom === booking.room &&
      intervalsConflict(bStart, bEnd, eStart, eEnd, roomBufferMin);
    const pracConflict =
      evPrac !== null &&
      evPrac === booking.practitionerName &&
      intervalsConflict(bStart, bEnd, eStart, eEnd, practitionerBufferMin);
    const equipmentConflict =
      Array.isArray(booking.equipment) &&
      evEquip.some((eq) => booking.equipment?.includes(eq)) &&
      intervalsConflict(bStart, bEnd, eStart, eEnd, equipmentBufferMin);

    return roomConflict || pracConflict || equipmentConflict;
  });

  if (conflict && !booking.force) {
    const {
      room: evRoom,
      practitioner: evPrac,
      equipment: evEquip,
    } = parseDesc(conflict.description ?? "");
    const equipmentCollision = Array.isArray(booking.equipment)
      ? booking.equipment.filter((eq) => evEquip.includes(eq))
      : [];

    if (evRoom === booking.room && evPrac === booking.practitionerName) {
      throw new Error(
        `${booking.room} with ${booking.practitionerName} is already booked at this time`,
      );
    } else if (equipmentCollision.length > 0) {
      throw new Error(
        `Equipment ${equipmentCollision.join(", ")} is already allocated at this time`,
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
        ...(booking.equipment ?? []).map((eq) => `Equipment: ${eq}`),
        booking.notes ? `Notes: ${booking.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      start: { dateTime: booking.startTime, timeZone: tz },
      end: { dateTime: booking.endTime, timeZone: tz },
      colorId: "11",
    },
  });

  return { id: event.data.id! };
}

export async function createAppointment(appt: Omit<Appointment, "id">): Promise<Appointment> {
  if (new Date(appt.startTime) < new Date()) {
    throw new Error("Cannot book an appointment in the past");
  }

  const tz = await getClinicTimezone();
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
      start: { dateTime: appt.startTime, timeZone: tz },
      end: { dateTime: appt.endTime, timeZone: tz },
      colorId: "11",
    },
  });

  return { ...appt, id: event.data.id! };
}

export async function getEventsByRange(
  from: string,
  to: string,
  timezone?: string,
): Promise<CalendarEvent[]> {
  const tz = timezone ?? (await getClinicTimezone());
  const calendar = getCalendarClient();
  const calId = calendarId();
  const timeMin = zonedHourToUtc(from, 0, tz).toISOString();
  const timeMax = zonedHourToUtc(to, 24, tz).toISOString();

  const res = await calendar.events.list({
    calendarId: calId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  return (res.data.items ?? []).filter(isCalendarEventWithStartTime).map((e) => {
    const { treatment, clientName } = resolveEventClient(e.summary ?? "", e.description ?? "");
    const { room, practitioner, contact, notes } = parseDesc(e.description ?? "");
    return {
      id: e.id!,
      treatment,
      clientName,
      startTime: e.start.dateTime,
      endTime: e.end?.dateTime ?? e.start.dateTime,
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

/** Sets (or inserts) a single "Prefix: value" line in a calendar event description, anchoring a new line right after `afterPrefix` if the prefix doesn't already exist. */
function setDescriptionField(
  description: string,
  prefix: string,
  value: string,
  afterPrefix = "Contact:",
): string {
  const lines = description.split("\n");
  let found = false;
  const updated = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true;
      return `${prefix} ${value}`;
    }
    return line;
  });
  if (!found) {
    const anchorIdx = updated.findIndex((l) => l.startsWith(afterPrefix));
    if (anchorIdx >= 0) {
      updated.splice(anchorIdx + 1, 0, `${prefix} ${value}`);
    } else {
      updated.push(`${prefix} ${value}`);
    }
  }
  return updated.join("\n");
}

function setDescriptionEmail(description: string, email: string): string {
  return setDescriptionField(description, "Email:", email);
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
}

/**
 * Patches a subset of an existing booking's fields in place (used by the booking-completion
 * link flow) — never creates a new calendar event. Regenerates the event summary when the
 * client name changes, since `summary` is built as "<treatment> — <clientName>".
 */
export async function patchCalendarBookingFields(
  eventId: string,
  fields: { clientName?: string; email?: string },
): Promise<void> {
  const calendar = getCalendarClient();
  const calId = calendarId();
  const { data: event } = await calendar.events.get({ calendarId: calId, eventId });

  let description = event.description ?? "";
  if (fields.clientName) {
    description = setDescriptionField(description, "Client:", fields.clientName);
  }
  if (fields.email) {
    description = setDescriptionEmail(description, fields.email);
  }

  const requestBody: calendar_v3.Schema$Event = { description };
  if (fields.clientName) {
    const { treatment } = parseEventSummary(event.summary ?? "");
    requestBody.summary = `${treatment} — ${fields.clientName}`;
  }

  await calendar.events.patch({ calendarId: calId, eventId, requestBody });
}

/** Reschedule a calendar event to a new start/end time. Returns old and new start times. */
export async function rescheduleCalendarEvent(
  eventId: string,
  newStartTime: string,
  newEndTime: string,
  timezone?: string,
): Promise<{
  clientName: string;
  treatment: string;
  clientContact: string;
  oldStartTime: string;
  newStartTime: string;
}> {
  const tz = timezone ?? (await getClinicTimezone());
  const calendar = getCalendarClient();
  const calId = calendarId();
  const { data: event } = await calendar.events.get({ calendarId: calId, eventId });
  const oldStartTime = event.start?.dateTime ?? "";
  await calendar.events.update({
    calendarId: calId,
    eventId,
    requestBody: {
      ...event,
      start: { dateTime: newStartTime, timeZone: tz },
      end: { dateTime: newEndTime, timeZone: tz },
    },
  });
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

  return (res.data.items ?? []).filter(isCalendarEventWithStartTime).map((e) => {
    const { treatment, clientName } = resolveEventClient(e.summary ?? "", e.description ?? "");
    const { contact } = parseDesc(e.description ?? "");
    return {
      id: e.id!,
      treatment,
      clientName,
      startTime: e.start.dateTime,
      endTime: e.end?.dateTime ?? e.start.dateTime,
      clientContact: contact,
      confirmed: "pending",
    };
  });
}
