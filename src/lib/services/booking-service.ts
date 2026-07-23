/**
 * Unified booking service for both admin UI and chatbot
 * Single source of truth for appointment booking logic
 */

import {
  getAvailableSlots,
  bookAdminAppointment,
  getEventsByRange,
} from "@/lib/integrations/google-calendar";
import type { AvailableSlot } from "@/types";
import {
  addCalendarDays,
  dateInZone,
  todayInZone,
  dateFromIsoInTz,
  timeKeyInTz,
} from "@/lib/booking/dates";
import {
  resolveServiceRecipe,
  buildAvailabilityInputs,
  checkServiceBookingWindow,
  resolveBookingCleanup,
} from "@/lib/booking/recipe";
import { getClinicTimezone } from "@/lib/clinic-config";
import { getPractitioners } from "@/lib/integrations/airtable";
import {
  getClinicBusinessHours,
  hoursForWeekday,
  fractionalHourToClock,
  weekdayKeyForDateStr,
  isDateOpen,
} from "@/lib/booking/clinic-hours";
import { flowAsync, logFlowStep } from "@/lib/voice/flow-context";

export interface BookingRequest {
  clientName: string;
  clientContact: string;
  clientEmail?: string;
  treatment: string;
  startTime: string;
  endTime: string;
  practitionerName: string;
  room: string;
  equipment?: string[];
  notes?: string;
  /** YYYY-MM-DD clinic date when date_time may be wrong but spoken time is correct */
  bookingDate?: string;
  /**
   * "bot" bookings are blocked when the matched Service has OnlineBookable = false (PRD §6) —
   * "a person must handle it." Admin/portal bookings (the default) are never blocked by this
   * flag since a person is already the one booking.
   */
  source?: "admin" | "bot";
  /**
   * Manual override (PRD §9): a front-desk person can force a booking that breaks a rule
   * (unqualified practitioner, wrong room, or a real scheduling conflict). Without this flag,
   * any such issue is returned as a warning instead of booking; with it, the booking proceeds
   * and the reasons are recorded on the calendar event for an audit trail.
   */
  force?: boolean;
}

/**
 * Thrown instead of booking when the request breaks a rule the PRD says must surface as a
 * warning (unqualified practitioner, room/equipment mismatch, or a real conflict) and the
 * caller didn't pass `force: true`. The booking is never silently blocked or silently allowed —
 * callers should show `warnings` and let a person decide whether to resubmit with `force: true`.
 */
export class BookingWarningsError extends Error {
  warnings: string[];
  constructor(warnings: string[]) {
    super(warnings.join(" "));
    this.name = "BookingWarningsError";
    this.warnings = warnings;
  }
}

export interface BookingResult {
  id: string;
  clientName: string;
  treatment: string;
  startTime: string;
  endTime: string;
  practitionerName: string;
  room: string;
  equipment?: string[];
}

export interface AvailabilityRequest {
  date: string;
  durationMinutes?: number;
  practitionerName?: string;
  room?: string;
  equipment?: string[];
  /** Service name (or id) to resolve a recipe for — when it matches a configured Service, room/practitioner/equipment candidates and cleanup buffers come from that Service's requirements instead of the caller-supplied lists. */
  treatment?: string;
  /** Clinic's configured IANA timezone; fetched automatically when omitted. Pass explicitly when a caller (e.g. bookAppointment) needs to guarantee the same value is used across several sub-calls in one logical operation. */
  timezone?: string;
}

export interface AvailabilityResult {
  date: string;
  durationMinutes: number;
  slots: AvailableSlot[];
  availablePractitioners: string[];
  availableRooms: string[];
  /** Set when this Service's own minNoticeHours/maxAdvanceDays rules out every slot on this
   * date — distinct from a genuinely full calendar, so callers can explain the real reason
   * ("only bookable up to N days ahead") instead of a misleading "fully booked". */
  bookingWindowNote?: string;
}

function normalizePractitionerKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^dr\.?\s*/i, "")
    .trim();
}

export function matchesRosterPractitioner(preferred: string, rosterName: string): boolean {
  const a = normalizePractitionerKey(preferred);
  const b = normalizePractitionerKey(rosterName);
  if (!a || !b) return false;
  return a === b || b.includes(a) || a.includes(b);
}

/** Resolve a spoken name to an active roster entry; ignore treatment names and unknown strings. */
export async function resolveRosterPractitioner(preferred?: string): Promise<string | undefined> {
  if (!preferred?.trim()) return undefined;
  try {
    const list = await getPractitioners();
    const match = list.find((p) => matchesRosterPractitioner(preferred, p.name));
    return match?.name;
  } catch {
    return undefined;
  }
}

function sameServiceLabel(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
}

/** Ignore practitioner filter when it is actually the treatment/service name. */
export async function sanitizePractitionerFilter(
  practitioner?: string,
  treatment?: string,
): Promise<string | undefined> {
  return flowAsync(
    "booking:sanitizePractitioner",
    async () => {
      if (!practitioner?.trim()) return undefined;
      if (treatment?.trim() && sameServiceLabel(practitioner, treatment)) return undefined;
      return resolveRosterPractitioner(practitioner);
    },
    { practitioner, treatment },
  );
}

function sameInstant(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

function naiveWallClockFromIso(iso: string): string | null {
  const match = iso.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

/** Match a requested ISO (or wrong-offset ISO) to a slot from check_availability. */
export function findMatchingSlot(
  slots: AvailableSlot[],
  requestedStartTime: string,
  dateHint?: string,
  tz = "America/Chicago",
): AvailableSlot | undefined {
  const exact = slots.find((slot) => sameInstant(slot.startTime, requestedStartTime));
  if (exact) return exact;

  const targetDate = dateHint ?? dateFromIsoInTz(requestedStartTime, tz);
  const localTarget = timeKeyInTz(requestedStartTime, tz);
  const wallClock = naiveWallClockFromIso(requestedStartTime);

  const byLocalTime = slots.find(
    (slot) =>
      dateFromIsoInTz(slot.startTime, tz) === targetDate &&
      timeKeyInTz(slot.startTime, tz) === localTarget,
  );
  if (byLocalTime) return byLocalTime;

  if (wallClock && wallClock !== localTarget) {
    return slots.find(
      (slot) =>
        dateFromIsoInTz(slot.startTime, tz) === targetDate &&
        timeKeyInTz(slot.startTime, tz) === wallClock,
    );
  }

  return undefined;
}

function timeKeyToMinutes(key: string): number {
  const [h, m] = key.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Parse a spoken/typed time ("11", "11 am", "11:00", "2:30 pm", or an ISO) to HH:mm (24h). */
export function parsePreferredTimeKey(input?: string, tz = "America/Chicago"): string | undefined {
  if (!input?.trim()) return undefined;
  const raw = input.trim().toLowerCase();

  if (/\d{4}-\d{2}-\d{2}t/i.test(raw)) {
    try {
      return timeKeyInTz(input, tz);
    } catch {
      return undefined;
    }
  }

  const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/);
  if (!m) return undefined;

  let hour = Number(m[1]);
  const minute = Number(m[2] ?? "0");
  const meridiem = m[3]?.replace(/\./g, "");
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return undefined;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Pick up to `limit` slots to present. When a time is requested, return the slots
 * nearest that time (chronological). Otherwise spread selections across the whole
 * day so callers see morning/afternoon/evening options — not just the first
 * consecutive 5-minute openings at 9:00 AM.
 */
export function selectPresentableSlots(
  slots: AvailableSlot[],
  limit: number,
  preferredTimeKey?: string,
  tz = "America/Chicago",
): AvailableSlot[] {
  if (limit <= 0) return [];
  if (slots.length <= limit) return slots;

  if (preferredTimeKey) {
    const target = timeKeyToMinutes(preferredTimeKey);
    const nearest = [...slots]
      .sort((a, b) => {
        const da = Math.abs(timeKeyToMinutes(timeKeyInTz(a.startTime, tz)) - target);
        const db = Math.abs(timeKeyToMinutes(timeKeyInTz(b.startTime, tz)) - target);
        return da - db;
      })
      .slice(0, limit);
    return nearest.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
  }

  const step = (slots.length - 1) / (limit - 1);
  const picked: AvailableSlot[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < limit; i++) {
    const idx = Math.round(i * step);
    if (!seen.has(idx)) {
      seen.add(idx);
      picked.push(slots[idx]!);
    }
  }
  return picked;
}

/**
 * Re-validate a specific requested startTime against live availability and resolve the
 * room/practitioner to actually book — used by the voice/chat agent, whose `startTime` is
 * LLM-computed from natural language and can land a few minutes off from a real slot.
 */
export async function resolveRequestedSlot(request: {
  startTime: string;
  durationMinutes: number;
  preferredPractitioner?: string;
  preferredRoom?: string;
  treatment?: string;
  date?: string;
}): Promise<{
  slot: AvailableSlot;
  practitioner: string;
  room: string;
}> {
  return flowAsync(
    "booking:resolveRequestedSlot",
    async () => {
      const tz = await getClinicTimezone();
      const date = request.date ?? dateFromIsoInTz(request.startTime, tz);

      const availability = await checkAvailability({
        date,
        durationMinutes: request.durationMinutes,
        practitionerName: request.preferredPractitioner,
        room: request.preferredRoom,
        treatment: request.treatment,
        timezone: tz,
      });

      const requestedSlot = findMatchingSlot(availability.slots, request.startTime, date, tz);
      if (!requestedSlot) {
        const alternatives = availability.slots
          .slice(0, 3)
          .map((slot) => `${slot.displayTime} (startTime: ${slot.startTime})`)
          .join("; ");
        throw new Error(
          alternatives
            ? `That time is not available on ${date}. Offer one of these instead: ${alternatives}`
            : `No open slots on ${date}. Try another day — do not escalate.`,
        );
      }

      const practitioner =
        request.preferredPractitioner &&
        requestedSlot.availablePractitioners.includes(request.preferredPractitioner)
          ? request.preferredPractitioner
          : requestedSlot.availablePractitioners[0];

      const room =
        request.preferredRoom && requestedSlot.availableRooms.includes(request.preferredRoom)
          ? request.preferredRoom
          : requestedSlot.availableRooms[0];

      if (!practitioner || !room) {
        throw new Error(
          `No practitioner and room are open at that time. Pick another slot from check_availability — do not escalate.`,
        );
      }

      return { slot: requestedSlot, practitioner, room };
    },
    request,
  );
}

/**
 * Check availability with room and practitioner awareness
 * Returns all available room+practitioner combinations for a given date
 */
export async function checkAvailability(request: AvailabilityRequest): Promise<AvailabilityResult> {
  const { date, durationMinutes = 60, equipment } = request;
  // Trimmed defensively — an untrimmed stored name (e.g. "Dr John ") vs a model-produced "Dr John"
  // would otherwise fail the exact-string filters below even though they refer to the same person/room.
  const practitionerName = request.practitionerName?.trim();
  const room = request.room?.trim();
  const timezone = request.timezone ?? (await getClinicTimezone());

  logFlowStep("booking:checkAvailability start", { date, treatment: request.treatment });

  const recipe = request.treatment ? await resolveServiceRecipe(request.treatment) : null;
  // A Service's own duration is authoritative once matched — don't trust a caller-supplied
  // guess (e.g. the AI agent) over what the clinic owner configured for this treatment.
  const effectiveDuration = recipe ? recipe.service.durationMinutes : durationMinutes;

  let slots: AvailableSlot[];
  let bookingWindowNote: string | undefined;

  if (recipe) {
    // Recipe-aware path (PRD §2/§6): candidates, cleanup buffers, qualifications, working
    // hours/breaks/time-off, and installed-equipment-binds-its-room all come from the
    // Service's resolved recipe instead of the caller-supplied free-text lists.
    const { roomNames, practitionerNames, equipmentGroups, context } =
      await buildAvailabilityInputs(recipe, date, timezone);
    const rooms = room ? roomNames.filter((r) => r === room) : roomNames;
    const practitioners = practitionerName
      ? practitionerNames.filter((p) => p === practitionerName)
      : practitionerNames;

    slots = await getAvailableSlots(
      date,
      effectiveDuration,
      rooms,
      practitioners,
      undefined,
      context,
      equipmentGroups,
      timezone,
    );

    // Enforce this Service's minimum notice / maximum advance window (PRD §6).
    const preWindowSlots = slots;
    slots = slots.filter((s) => !checkServiceBookingWindow(recipe.service, s.startTime, timezone));
    if (preWindowSlots.length > 0 && slots.length === 0) {
      // Every slot that would otherwise be free got removed by the booking-window rule, not a
      // real conflict — surface the specific reason instead of a misleading "no availability".
      bookingWindowNote =
        checkServiceBookingWindow(recipe.service, preWindowSlots[0].startTime, timezone) ??
        undefined;
    }
  } else {
    // Legacy freeform path — for treatments not yet configured as a Service. When the client
    // has no practitioner preference, consider every active practitioner as a candidate
    // instead of none — an empty candidate list here used to make `suggestSlot` fall back to
    // a literal "Available Practitioner" placeholder string, which then got written into the
    // real calendar event instead of an actual person's name.
    const practitioners = practitionerName
      ? [practitionerName]
      : (await getPractitioners()).map((p) => p.name);
    const rooms = room ? [room] : undefined;
    const equipments = equipment?.length ? equipment : undefined;
    slots = await getAvailableSlots(
      date,
      effectiveDuration,
      rooms,
      practitioners,
      equipments,
      undefined,
      undefined,
      timezone,
    );
  }

  // Collect all unique available practitioners and rooms across all slots
  const allPractitioners = new Set<string>();
  const allRooms = new Set<string>();

  slots.forEach((slot) => {
    (slot.availablePractitioners ?? []).forEach((p) => allPractitioners.add(p));
    (slot.availableRooms ?? []).forEach((r) => allRooms.add(r));
  });

  logFlowStep("booking:checkAvailability complete", { date, count: slots.length });

  return {
    date,
    durationMinutes: effectiveDuration,
    slots,
    bookingWindowNote,
    availablePractitioners: Array.from(allPractitioners).sort(),
    availableRooms: Array.from(allRooms).sort(),
  };
}

/**
 * Book an appointment with full conflict checking
 * Validates that room + practitioner combo is available
 * Used by both admin UI and chatbot
 */
export async function bookAppointment(request: BookingRequest): Promise<BookingResult> {
  // Validate required fields
  if (
    !request.clientName ||
    !request.clientContact ||
    !request.treatment ||
    !request.startTime ||
    !request.endTime ||
    !request.practitionerName ||
    !request.room
  ) {
    throw new Error("Missing required booking fields");
  }

  // Defense-in-depth against stray whitespace in either the AI's input or stored Practitioner/Room
  // names (the root cause of one such mismatch — an untrimmed "Dr John " vs a model-produced
  // "Dr John" — was fixed at the data-mapping layer in recipe.ts, but every exact-string comparison
  // downstream is one stray space away from the same false "not qualified"/"not available" rejection).
  request.practitionerName = request.practitionerName.trim();
  request.room = request.room.trim();

  const timezone = await getClinicTimezone();

  // Validate against the clinic's configured business hours (Settings > Clinic info) — in the
  // CLINIC's configured timezone, not the server process's local timezone (`Date.getHours()`/
  // `getDay()` would silently use whichever timezone the Node process happens to run in). This
  // reads the exact same schedule getAvailableSlots uses, so the two can never disagree about
  // what's actually bookable (previously hardcoded here as a flat 9 AM-7 PM cutoff that could
  // silently diverge from getAvailableSlots' own hardcoded 7:30 PM boundary).
  const startDate = new Date(request.startTime);
  const localDateStr = dateInZone(startDate, timezone);
  const weekday = weekdayKeyForDateStr(localDateStr);
  const schedule = await getClinicBusinessHours();
  const hoursToday = hoursForWeekday(schedule, weekday);

  if (!hoursToday) {
    throw new Error(`Appointments cannot be booked on this day — clinic is closed`);
  }

  const hourPart =
    parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        hour12: false,
      }).format(startDate),
      10,
    ) % 24;
  const minutePart = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, minute: "2-digit" }).format(startDate),
    10,
  );
  const fractionalHour = hourPart + minutePart / 60;

  if (fractionalHour < hoursToday.startHour || fractionalHour >= hoursToday.endHour) {
    throw new Error(
      `Appointments can only be booked between ${fractionalHourToClock(hoursToday.startHour)} and ${fractionalHourToClock(hoursToday.endHour)}`,
    );
  }

  const recipe = await resolveServiceRecipe(request.treatment);

  // A Service's own duration is authoritative once matched — recompute endTime from it rather
  // than trusting whatever the caller (e.g. the AI agent) guessed.
  const endTime = recipe
    ? new Date(
        new Date(request.startTime).getTime() + recipe.service.durationMinutes * 60_000,
      ).toISOString()
    : request.endTime;

  if (recipe) {
    if (!recipe.service.onlineBookable && request.source === "bot") {
      throw new Error(
        `${recipe.service.name} requires staff to book — please contact the clinic directly.`,
      );
    }
    const windowError = checkServiceBookingWindow(recipe.service, request.startTime, timezone);
    if (windowError) {
      throw new Error(windowError);
    }
  }

  // Policy warnings (PRD §9): computed regardless of calendar conflicts, so a front-desk
  // override still records *why* the booking broke a rule.
  const policyWarnings: string[] = [];
  if (recipe) {
    if (!recipe.qualifiedPractitioners.some((p) => p.name === request.practitionerName)) {
      policyWarnings.push(
        `${request.practitionerName} is not marked qualified for ${recipe.service.name}.`,
      );
    }
    if (!recipe.roomCandidates.some((r) => r.name === request.room)) {
      policyWarnings.push(
        `${request.room} does not satisfy ${recipe.service.name}'s room/equipment requirement.`,
      );
    }
  }

  // Check if this room+practitioner combo is actually available
  const date = request.startTime.split("T")[0];
  const duration = Math.round(
    (new Date(endTime).getTime() - new Date(request.startTime).getTime()) / 60000,
  );

  const availability = await checkAvailability({
    date,
    durationMinutes: duration,
    practitionerName: request.practitionerName,
    room: request.room,
    treatment: request.treatment,
    timezone,
  });

  // Find a slot matching the requested time. The AI computes `request.startTime` itself from
  // natural language (or from a human-readable "10:05 AM" alternate it was told to retry with) —
  // LLM timezone arithmetic is unreliable, so requiring a byte-for-byte ISO string match here used
  // to reject perfectly valid requests that landed a few minutes off from a real available slot,
  // producing an infinite "not available, try X" loop even when X was exactly what was requested.
  // Snap to the closest available slot within one grid step instead of requiring exact equality.
  const requestedTimeMs = new Date(request.startTime).getTime();
  const matchingCandidates = availability.slots
    .filter(
      (slot) =>
        slot.availablePractitioners?.includes(request.practitionerName) &&
        slot.availableRooms?.includes(request.room),
    )
    .map((slot) => ({
      slot,
      distanceMs: Math.abs(new Date(slot.startTime).getTime() - requestedTimeMs),
    }))
    .sort((a, b) => a.distanceMs - b.distanceMs);

  const requestedSlot =
    matchingCandidates.length > 0 && matchingCandidates[0].distanceMs <= duration * 60_000
      ? matchingCandidates[0].slot
      : undefined;

  if (!requestedSlot) {
    // The requested time is no longer available. Include each alternate's exact ISO startTime
    // alongside its human-readable display time — an AI retrying from displayTime alone has to
    // redo local-to-UTC arithmetic itself, which is exactly how a "11:45 AM" request has landed
    // as literally 11:45 UTC (4:45 PM in a UTC+5 clinic) before: reusing the given ISO value
    // verbatim removes that arithmetic entirely for a retry.
    const availableSlots = availability.slots
      .filter((s) => s.availablePractitioners?.includes(request.practitionerName))
      .filter((s) => s.availableRooms?.includes(request.room))
      .slice(0, 3)
      .map((s) => `${s.displayTime} (date_time: ${s.startTime})`)
      .join(", ");

    policyWarnings.push(
      availableSlots
        ? `${request.room} with ${request.practitionerName} is not available at that time. Try one of: ${availableSlots} — reuse the exact date_time value shown, do not recompute it from the display time.`
        : `${request.room} with ${request.practitionerName} has no availability on ${date}`,
    );
  }

  if (policyWarnings.length > 0 && !request.force) {
    throw new BookingWarningsError(policyWarnings);
  }

  const cleanup = recipe ? resolveBookingCleanup(recipe, request.room, request.equipment) : {};

  // Use the matched slot's exact grid-aligned times when one was found, rather than the AI's
  // possibly slightly-off computed time — this is what actually gets booked and confirmed back.
  const bookingStartTime = requestedSlot?.startTime ?? request.startTime;
  const bookingEndTime = requestedSlot?.endTime ?? endTime;

  // Book via the same function both admin and agent use
  const result = await bookAdminAppointment({
    startTime: bookingStartTime,
    endTime: bookingEndTime,
    clientName: request.clientName,
    clientContact: request.clientContact,
    clientEmail: request.clientEmail,
    treatment: request.treatment,
    room: request.room,
    practitionerName: request.practitionerName,
    equipment: request.equipment,
    notes:
      policyWarnings.length > 0
        ? [request.notes, `Override: ${policyWarnings.join(" ")}`].filter(Boolean).join(" | ")
        : request.notes,
    force: request.force,
    timezone,
    ...cleanup,
  });

  return {
    id: result.id,
    clientName: request.clientName,
    treatment: request.treatment,
    startTime: bookingStartTime,
    endTime: bookingEndTime,
    practitionerName: request.practitionerName,
    room: request.room,
  };
}

/**
 * Suggest the best available slot for a client
 * Used by chatbot to recommend slots to clients
 */
export async function suggestSlot(request: {
  date: string;
  durationMinutes?: number;
  preferredPractitioner?: string;
  preferredRoom?: string;
  treatment?: string;
}): Promise<{
  slot: AvailableSlot;
  practitioner: string;
  room: string;
  suggestion: string;
}> {
  const availability = await checkAvailability({
    date: request.date,
    durationMinutes: request.durationMinutes,
    practitionerName: request.preferredPractitioner,
    room: request.preferredRoom,
    treatment: request.treatment,
  });

  if (availability.slots.length === 0) {
    throw new Error(
      `No availability on ${request.date}. Please try a different date or contact the clinic.`,
    );
  }

  // Pick the first available slot
  const slot = availability.slots[0];

  // If preferred practitioner is available in this slot, suggest them
  const practitioner =
    request.preferredPractitioner &&
    slot.availablePractitioners?.includes(request.preferredPractitioner)
      ? request.preferredPractitioner
      : (slot.availablePractitioners?.[0] ?? "Available Practitioner");

  // If preferred room is available in this slot, suggest it
  const room =
    request.preferredRoom && slot.availableRooms?.includes(request.preferredRoom)
      ? request.preferredRoom
      : (slot.availableRooms?.[0] ?? "Available Room");

  return {
    slot,
    practitioner,
    room,
    suggestion: `${slot.displayTime} with ${practitioner} in ${room}`,
  };
}

/**
 * Get appointments in a date range
 * Used for calendar views and availability checking
 */
export async function getAppointmentsInRange(from: string, to: string) {
  return getEventsByRange(from, to);
}

/** Search day-by-day from today for the soonest open slots (skips days the clinic's configured schedule marks closed). */
export async function findEarliestAvailability(request: {
  durationMinutes?: number;
  practitionerName?: string;
  room?: string;
  maxDaysAhead?: number;
  treatment?: string;
}): Promise<{
  slots: AvailableSlot[];
  earliestDate: string | null;
  datesChecked: string[];
  summary: string;
}> {
  const durationMinutes = request.durationMinutes ?? 60;
  const maxDays = request.maxDaysAhead ?? 14;
  const timezone = await getClinicTimezone();
  const schedule = await getClinicBusinessHours();
  let date = todayInZone(timezone);
  for (let guard = 0; guard < maxDays && !isDateOpen(date, schedule); guard++) {
    date = addCalendarDays(date, 1);
  }
  const datesChecked: string[] = [];
  const collected: AvailableSlot[] = [];
  let earliestDate: string | null = null;
  let lastBookingWindowNote: string | undefined;

  for (let i = 0; i < maxDays; i++) {
    if (!isDateOpen(date, schedule)) {
      date = addCalendarDays(date, 1);
      continue;
    }

    datesChecked.push(date);
    const day = await checkAvailability({
      date,
      durationMinutes,
      practitionerName: request.practitionerName,
      room: request.room,
      treatment: request.treatment,
      timezone,
    });
    if (day.bookingWindowNote) lastBookingWindowNote = day.bookingWindowNote;

    if (day.slots.length > 0) {
      if (!earliestDate) earliestDate = date;
      for (const slot of day.slots) {
        if (collected.length >= 3) break;
        collected.push(slot);
      }
      if (collected.length >= 3) break;
    }

    date = addCalendarDays(date, 1);
  }

  // If every single day checked was blocked by the same booking-window rule (not real
  // conflicts), that's the actual reason nothing was found — surface it distinctly instead of
  // a misleading "no open slots", which reads as a full calendar rather than a policy limit.
  const summary =
    collected.length > 0
      ? `Earliest availability starts ${earliestDate}. Found ${collected.length} slot(s) across ${datesChecked.length} day(s) checked (from today forward). Present these times to the client — do not skip to later dates if earlier slots exist.`
      : lastBookingWindowNote
        ? `${lastBookingWindowNote} — this is a booking-policy limit for this treatment, not a full calendar. Tell the client this specific reason rather than saying it's fully booked; offer a date within the allowed window instead.`
        : `No open slots in the next ${datesChecked.length} business day(s) checked (from today). Try a different treatment duration or practitioner.`;

  return { slots: collected, earliestDate, datesChecked, summary };
}
