import { google, type calendar_v3 } from "googleapis";
import type { AvailableSlot, CalendarEvent, Appointment } from "@/types";
import { SLOT_BUFFER_MINUTES, intervalsConflict, intervalsOverlap } from "@/lib/booking/constants";
import { getClinicTimezone } from "@/lib/clinic-config";
import {
  getClinicBusinessHours,
  hoursForWeekday,
  WEEKDAY_BY_UTC_DAY,
} from "@/lib/booking/clinic-hours";
import { phonesMatch } from "@/lib/phone";
import { addCalendarDays } from "@/lib/booking/dates";
import { getSupabase } from "@/lib/supabase";

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

/** Real active room names from Settings > Rooms — the fallback used whenever a caller doesn't
 * pass an explicit room list. Previously hardcoded to a fake ["Room 1", "Room 2"] placeholder
 * that didn't correspond to any real room, silently breaking every booking that hit it. */
async function getActiveRoomNames(): Promise<string[]> {
  const sb = getSupabase();
  const { data } = await sb.from("Rooms").select("Name").eq("Status", "Active").order("Name");
  return (data ?? []).map((r) => String(r["Name"] ?? "")).filter(Boolean);
}

const EVENTS_RANGE_CACHE_MS = 45_000;
const eventsRangeCache = new Map<string, { at: number; events: CalendarEvent[] }>();

/** Clear cached calendar ranges after book/cancel/reschedule so lookups see fresh data. */
export function invalidateEventsRangeCache(): void {
  eventsRangeCache.clear();
}

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

export function parseDesc(description: string): {
  room: string | null;
  practitioner: string | null;
  equipment: string[];
  client: string | null;
  clientId: string | null;
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
    clientId: find("Client ID:") || null,
    contact: find("Contact:"),
    email: find("Email:") || emailInNotes,
    notes: rawNotes,
  };
}

export async function getAvailableSlots(
  date: string,
  durationMinutes = 60,
  /** Omit to use every real active room from Settings > Rooms. */
  rooms?: string[],
  practitionerNames: string[] = [],
  equipmentNames: string[] = [],
  context?: ResourceAvailabilityContext,
  /** When set, each group means "need one free item from this group" (OR within a group, AND across groups) — used for a service's equipment requirement rows instead of the legacy flat AND-all-of `equipmentNames` semantics. */
  equipmentRequirementGroups?: string[][],
  /** Clinic's configured IANA timezone (Settings > Clinic info). Fetched automatically when omitted. */
  timezone?: string,
): Promise<AvailableSlot[]> {
  const tz = timezone ?? (await getClinicTimezone());
  const roomList = rooms ?? (await getActiveRoomNames());

  if (date < todayInZone(tz)) return [];

  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
  const schedule = await getClinicBusinessHours();
  const todayHours = hoursForWeekday(schedule, WEEKDAY_BY_UTC_DAY[dayOfWeek]);
  if (!todayHours) return []; // clinic is closed this weekday, per the configured schedule

  const calendar = getCalendarClient();
  const calId = calendarId();

  const dayStart = zonedHourToUtc(date, todayHours.startHour, tz);
  const dayEnd = zonedHourToUtc(date, todayHours.endHour, tz);
  // Slot step is dynamic (= this booking's own duration), never a fixed constant — a fixed
  // step of 0 previously left the slot-generation loop below unable to advance its cursor,
  // hanging the process forever. Guard the floor at 1 minute so a bad/zero duration can never
  // reintroduce that infinite loop.
  const stepMs = Math.max(durationMinutes, 1) * 60_000;

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
    const blocks = Math.ceil(elapsed / stepMs);
    cursor = new Date(dayStart.getTime() + blocks * stepMs);
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
      : roomList.filter((r) => {
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

    cursor = new Date(cursor.getTime() + stepMs);
  }

  return slots;
}

export async function bookAdminAppointment(booking: {
  startTime: string;
  endTime: string;
  clientName: string;
  clientContact?: string;
  clientEmail?: string;
  /** The Clients table row id, when known at booking time — written into the event description
   * as "Client ID:" so future lookups can match this booking by a stable id instead of falling
   * back to phone/name matching (see getAppointmentHistoryForContact). */
  clientId?: string;
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
  const bStart = new Date(booking.startTime);
  const bEnd = new Date(booking.endTime);

  const claimKeys = [
    `room:${booking.room}@${bStart.toISOString()}`,
    `practitioner:${booking.practitionerName}@${bStart.toISOString()}`,
    ...(booking.equipment ?? []).map((eq) => `equipment:${eq}@${bStart.toISOString()}`),
  ];
  await claimBookingResources(claimKeys);

  try {
    return await commitBooking(booking, bStart, bEnd, tz);
  } finally {
    await releaseBookingResources(claimKeys);
  }
}

/**
 * Atomically claims each resource+start-time key via booking_claims' UNIQUE constraint (see
 * migrations/create_booking_claims.sql — PRD gap R-1). Sweeps any stale claim on this exact key
 * first (a prior request that crashed before its `finally` ran), so an abandoned claim can't
 * permanently block a resource. Throws a retryable error the moment any key is already held by a
 * genuinely concurrent request, and releases whichever keys it *did* just claim before throwing.
 */
async function claimBookingResources(keys: string[]): Promise<void> {
  const sb = getSupabase();
  const STALE_MS = 20_000;
  const claimed: string[] = [];
  try {
    for (const key of keys) {
      await sb
        .from("booking_claims")
        .delete()
        .eq("resource_key", key)
        .lt("created_at", new Date(Date.now() - STALE_MS).toISOString());

      const { error } = await sb.from("booking_claims").insert({ resource_key: key });
      if (error) {
        // 23505 = unique_violation — a genuinely concurrent request holds this exact
        // resource+time right now; that's the real race this table exists to catch.
        // Any other error (most notably 42P01 undefined_table, before the migration in
        // migrations/create_booking_claims.sql has been run) must not block booking
        // entirely — fail open and log, rather than making every single booking fail with
        // a misleading "someone else is booking this" until the table exists.
        if (error.code === "23505") {
          throw new Error(
            "Someone else is booking this exact time right now — please try again in a moment.",
          );
        }
        console.error("[booking_claims] claim failed, proceeding without it:", error.message);
        return;
      }
      claimed.push(key);
    }
  } catch (err) {
    await releaseBookingResources(claimed);
    throw err;
  }
}

async function releaseBookingResources(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const sb = getSupabase();
  await sb.from("booking_claims").delete().in("resource_key", keys);
}

async function commitBooking(
  booking: Parameters<typeof bookAdminAppointment>[0],
  bStart: Date,
  bEnd: Date,
  tz: string,
): Promise<{ id: string }> {
  const calendar = getCalendarClient();
  const calId = calendarId();

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
        booking.clientId ? `Client ID: ${booking.clientId}` : "",
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

  invalidateEventsRangeCache();
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

  invalidateEventsRangeCache();
  return { ...appt, id: event.data.id! };
}

export async function getEventsByRange(
  from: string,
  to: string,
  timezone?: string,
): Promise<CalendarEvent[]> {
  const tz = timezone ?? (await getClinicTimezone());
  const cacheKey = `${from}|${to}|${tz}`;
  const cached = eventsRangeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < EVENTS_RANGE_CACHE_MS) {
    return cached.events;
  }

  const calendar = getCalendarClient();
  const calId = calendarId();
  const timeMin = zonedHourToUtc(from, 0, tz).toISOString();
  const timeMax = zonedHourToUtc(to, 24, tz).toISOString();

  // A wide date range can exceed Google's default page size (server default is 250) for a busy
  // clinic — without paging through, events beyond the first page are silently dropped with no
  // error, undetectably truncating history for whichever caller asked for a long window.
  const items: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const res = await calendar.events.list({
      calendarId: calId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 500,
      pageToken,
    });
    items.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  const events = items.filter(isCalendarEventWithStartTime).map((e) => {
    const { treatment, clientName } = resolveEventClient(e.summary ?? "", e.description ?? "");
    const { room, practitioner, contact, email, notes, clientId } = parseDesc(e.description ?? "");
    return {
      id: e.id!,
      treatment,
      clientName,
      startTime: e.start.dateTime,
      endTime: e.end?.dateTime ?? e.start.dateTime,
      clientContact: contact,
      clientEmail: email || undefined,
      clientId: clientId ?? undefined,
      notes,
      room: room ?? "",
      practitioner: practitioner ?? "",
    };
  });

  eventsRangeCache.set(cacheKey, { at: Date.now(), events });
  return events;
}

export interface AppointmentHistoryResult {
  past: CalendarEvent[];
  upcoming: CalendarEvent[];
  /** True when the oldest matched past appointment falls near the lookback window's edge —
   * a signal there's likely earlier history the window cut off, not that this IS all of it. */
  truncated: boolean;
  matchedBy: "id" | "phone" | "name" | "unmatched";
}

/** Full appointment history (past + upcoming) for a customer, for the 360° profile view.
 * Matches by the Clients row id first — most bookings made after this field was introduced carry
 * it (see bookAdminAppointment's `Client ID:` line) — then phone (phonesMatch, tolerant of
 * formatting/country-code differences), then falls back to case-insensitive name equality for
 * older events that predate both. All three signals are unioned (not exclusive), so a customer
 * with a mix of old phone/name-only bookings and newer id-tagged ones sees their full history;
 * `matchedBy` reports the strongest tier that actually contributed a match, so callers can surface
 * confidence to the UI rather than treating every result as equally reliable. */
export async function getAppointmentHistoryForContact(
  contact: { id?: string; phone?: string; name?: string },
  opts: { pastDays?: number; futureDays?: number } = {},
): Promise<AppointmentHistoryResult> {
  const pastDays = opts.pastDays ?? 730;
  const futureDays = opts.futureDays ?? 180;
  const tz = await getClinicTimezone();
  const today = todayInZone(tz);
  const from = addCalendarDays(today, -pastDays);
  const to = addCalendarDays(today, futureDays);
  const events = await getEventsByRange(from, to, tz);

  const id = contact.id?.trim();
  const phone = contact.phone?.trim();
  const byId = new Set(id ? events.filter((e) => e.clientId === id) : []);
  const byPhone = new Set(
    phone ? events.filter((e) => e.clientContact && phonesMatch(e.clientContact, phone)) : [],
  );
  const byName = new Set(
    contact.name?.trim()
      ? events.filter(
          (e) => e.clientName?.trim().toLowerCase() === contact.name!.trim().toLowerCase(),
        )
      : [],
  );

  const matched = Array.from(new Set([...byId, ...byPhone, ...byName]));
  const matchedBy: AppointmentHistoryResult["matchedBy"] =
    byId.size > 0 ? "id" : byPhone.size > 0 ? "phone" : byName.size > 0 ? "name" : "unmatched";

  const now = Date.now();
  const past = matched
    .filter((e) => new Date(e.startTime).getTime() < now)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  const upcoming = matched
    .filter((e) => new Date(e.startTime).getTime() >= now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const windowEdgeMs = zonedHourToUtc(from, 0, tz).getTime();
  const oldestPastMs = past.length ? new Date(past[past.length - 1].startTime).getTime() : null;
  const truncated = oldestPastMs !== null && oldestPastMs - windowEdgeMs < 30 * 86_400_000;

  return { past, upcoming, truncated, matchedBy };
}

/** Past (up to 365 days back) calendar events matching this phone number, most recent first. */
async function getPastAppointmentsForContact(phone: string | undefined): Promise<CalendarEvent[]> {
  if (!phone?.trim()) return [];
  const tz = await getClinicTimezone();
  const today = todayInZone(tz);
  const from = addCalendarDays(today, -365);
  const events = await getEventsByRange(from, today, tz);

  return events
    .filter((e) => e.clientContact && phonesMatch(e.clientContact, phone))
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
}

/** Returning-customer default (PRD §8): when a client states no practitioner preference, the
 * bot should default to whoever last treated them. Looks back over the last 365 days of the
 * clinic calendar for the most recent past appointment matching this phone number and returns
 * the practitioner name recorded on it, if any. */
export async function findLastPractitionerForContact(
  phone: string | undefined,
): Promise<string | undefined> {
  const past = await getPastAppointmentsForContact(phone);
  return past.find((e) => e.practitioner)?.practitioner || undefined;
}

/** Has this phone number ever had a past appointment on the clinic calendar? Used to enforce a
 * Service's "requires prior consultation" flag (PRD §6) — v1 is a simple yes/no on whether the
 * client has been seen before at all, not tracked per-service or with a time window. */
export async function hasPriorAppointment(phone: string | undefined): Promise<boolean> {
  const past = await getPastAppointmentsForContact(phone);
  return past.length > 0;
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
  invalidateEventsRangeCache();
}

/**
 * Patches a subset of an existing booking's fields in place (used by the booking-completion
 * link flow) — never creates a new calendar event. Regenerates the event summary when the
 * client name changes, since `summary` is built as "<treatment> — <clientName>".
 */
export async function patchCalendarBookingFields(
  eventId: string,
  fields: { clientName?: string; email?: string; clientId?: string },
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
  if (fields.clientId) {
    description = setDescriptionField(description, "Client ID:", fields.clientId);
  }

  const requestBody: calendar_v3.Schema$Event = { description };
  if (fields.clientName) {
    const { treatment } = parseEventSummary(event.summary ?? "");
    requestBody.summary = `${treatment} — ${fields.clientName}`;
  }

  await calendar.events.patch({ calendarId: calId, eventId, requestBody });
  invalidateEventsRangeCache();
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
