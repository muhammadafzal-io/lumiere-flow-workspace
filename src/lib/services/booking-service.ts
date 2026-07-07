/**
 * Unified booking service for both admin UI and chatbot
 * Single source of truth for appointment booking logic
 */

import {
  getAvailableSlots,
  bookAdminAppointment,
  getEventsByRange,
} from "@/lib/integrations/google-calendar";
import { getPractitioners } from "@/lib/integrations/airtable";
import type { AvailableSlot } from "@/types";
import {
  addChicagoDays,
  chicagoDateFromIso,
  chicagoHour,
  chicagoTimeKey,
  isSundayChicago,
  isSundayChicagoFromIso,
  nextOpenChicagoDay,
  todayInChicago,
} from "@/lib/booking/dates";
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
  notes?: string;
  /** YYYY-MM-DD clinic date when date_time may be wrong but spoken time is correct */
  bookingDate?: string;
}

export interface BookingResult {
  id: string;
  clientName: string;
  treatment: string;
  startTime: string;
  endTime: string;
  practitionerName: string;
  room: string;
}

export interface AvailabilityRequest {
  date: string;
  durationMinutes?: number;
  practitionerName?: string;
  room?: string;
}

export interface AvailabilityResult {
  date: string;
  durationMinutes: number;
  slots: AvailableSlot[];
  availablePractitioners: string[];
  availableRooms: string[];
}

function sameInstant(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
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
export async function resolveRosterPractitioner(
  preferred?: string,
): Promise<string | undefined> {
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

async function rosterPractitionerNames(preferred?: string): Promise<string[]> {
  try {
    const list = await getPractitioners();
    const names = list.map((p) => p.name).filter(Boolean);
    if (names.length === 0) return [];
    if (!preferred?.trim()) return names;
    const resolved = names.find((n) => matchesRosterPractitioner(preferred, n));
    return resolved ? [resolved] : names;
  } catch {
    return [];
  }
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
): AvailableSlot | undefined {
  const exact = slots.find((slot) => sameInstant(slot.startTime, requestedStartTime));
  if (exact) return exact;

  const targetDate = dateHint ?? chicagoDateFromIso(requestedStartTime);
  const chicagoTarget = chicagoTimeKey(requestedStartTime);
  const wallClock = naiveWallClockFromIso(requestedStartTime);

  const byChicagoTime = slots.find(
    (slot) =>
      chicagoDateFromIso(slot.startTime) === targetDate &&
      chicagoTimeKey(slot.startTime) === chicagoTarget,
  );
  if (byChicagoTime) return byChicagoTime;

  if (wallClock && wallClock !== chicagoTarget) {
    return slots.find(
      (slot) =>
        chicagoDateFromIso(slot.startTime) === targetDate &&
        chicagoTimeKey(slot.startTime) === wallClock,
    );
  }

  return undefined;
}

export async function resolveRequestedSlot(request: {
  startTime: string;
  durationMinutes: number;
  preferredPractitioner?: string;
  preferredRoom?: string;
  date?: string;
}): Promise<{
  slot: AvailableSlot;
  practitioner: string;
  room: string;
}> {
  return flowAsync("booking:resolveRequestedSlot", async () => {
    const date = request.date ?? chicagoDateFromIso(request.startTime);

    const availability = await checkAvailability({
      date,
      durationMinutes: request.durationMinutes,
      practitionerName: request.preferredPractitioner,
      room: request.preferredRoom,
    });

    const requestedSlot = findMatchingSlot(availability.slots, request.startTime, date);
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
  }, request);
}

/**
 * Check availability with room and practitioner awareness
 * Returns all available room+practitioner combinations for a given date
 */
export async function checkAvailability(request: AvailabilityRequest): Promise<AvailabilityResult> {
  return flowAsync("booking:checkAvailability", async () => {
    const { date, durationMinutes = 60, practitionerName, room } = request;

    const practitioners = await rosterPractitionerNames(practitionerName);
    logFlowStep("booking:checkAvailability practitioners", { practitioners });
    if (practitioners.length === 0) {
      throw new Error(
        "Practitioner schedule is temporarily unavailable — try again shortly. Do not escalate for calendar issues.",
      );
    }

    const rooms = room ? [room] : undefined;

    const slots = await getAvailableSlots(date, durationMinutes, rooms, practitioners);
    logFlowStep("booking:checkAvailability slots", { count: slots.length, date });

    const allPractitioners = new Set<string>();
    const allRooms = new Set<string>();

    slots.forEach((slot) => {
      (slot.availablePractitioners ?? []).forEach((p) => allPractitioners.add(p));
      (slot.availableRooms ?? []).forEach((r) => allRooms.add(r));
    });

    return {
      date,
      durationMinutes,
      slots,
      availablePractitioners: Array.from(allPractitioners).sort(),
      availableRooms: Array.from(allRooms).sort(),
    };
  }, request);
}

/**
 * Book an appointment with full conflict checking
 * Validates that room + practitioner combo is available
 * Used by both admin UI and chatbot
 */
export async function bookAppointment(request: BookingRequest): Promise<BookingResult> {
  return flowAsync("booking:bookAppointment", async () => {
    if (
      !request.clientName ||
      !request.clientContact ||
      !request.treatment ||
      !request.startTime ||
      !request.practitionerName ||
      !request.room
    ) {
      throw new Error("Missing required booking fields");
    }

    if (isSundayChicagoFromIso(request.startTime)) {
      throw new Error("Appointments cannot be booked on Sundays — clinic is closed");
    }

    const hour = chicagoHour(request.startTime);
    if (hour < 9 || hour >= 19) {
      throw new Error("Appointments can only be booked between 9:00 AM and 7:00 PM Austin time");
    }

    const duration = request.endTime
      ? Math.round(
          (new Date(request.endTime).getTime() - new Date(request.startTime).getTime()) / 60000,
        )
      : 60;

    const resolved = await resolveRequestedSlot({
      startTime: request.startTime,
      durationMinutes: duration,
      preferredPractitioner: request.practitionerName,
      preferredRoom: request.room,
      date: request.bookingDate,
    });

    const result = await bookAdminAppointment({
      startTime: resolved.slot.startTime,
      endTime: resolved.slot.endTime,
      clientName: request.clientName,
      clientContact: request.clientContact,
      clientEmail: request.clientEmail,
      treatment: request.treatment,
      room: resolved.room,
      practitionerName: resolved.practitioner,
      notes: request.notes,
    });

    return {
      id: result.id,
      clientName: request.clientName,
      treatment: request.treatment,
      startTime: resolved.slot.startTime,
      endTime: resolved.slot.endTime,
      practitionerName: resolved.practitioner,
      room: resolved.room,
    };
  }, {
    clientName: request.clientName,
    treatment: request.treatment,
    startTime: request.startTime,
    practitionerName: request.practitionerName,
    room: request.room,
  });
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
  });

  if (availability.slots.length === 0) {
    throw new Error(
      `No availability on ${request.date}. Please try a different date or contact the clinic.`,
    );
  }

  const slot = availability.slots[0];
  const practitioner =
    request.preferredPractitioner &&
    slot.availablePractitioners?.includes(request.preferredPractitioner)
      ? request.preferredPractitioner
      : (slot.availablePractitioners?.[0] ?? "Available Practitioner");
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

/** Search day-by-day from today for the soonest open slots (skips Sundays). */
export async function findEarliestAvailability(request: {
  durationMinutes?: number;
  practitionerName?: string;
  room?: string;
  maxDaysAhead?: number;
}): Promise<{
  slots: AvailableSlot[];
  earliestDate: string | null;
  datesChecked: string[];
  summary: string;
}> {
  return flowAsync("booking:findEarliestAvailability", async () => {
    const durationMinutes = request.durationMinutes ?? 60;
    const maxDays = request.maxDaysAhead ?? 14;
    let date = nextOpenChicagoDay(todayInChicago());
    const datesChecked: string[] = [];
    const collected: AvailableSlot[] = [];
    let earliestDate: string | null = null;

    for (let i = 0; i < maxDays; i++) {
      if (isSundayChicago(date)) {
        date = addChicagoDays(date, 1);
        continue;
      }

      datesChecked.push(date);
      const day = await checkAvailability({
        date,
        durationMinutes,
        practitionerName: request.practitionerName,
        room: request.room,
      });

      if (day.slots.length > 0) {
        if (!earliestDate) earliestDate = date;
        for (const slot of day.slots) {
          if (collected.length >= 3) break;
          collected.push(slot);
        }
        if (collected.length >= 3) break;
      }

      date = addChicagoDays(date, 1);
    }

    const summary =
      collected.length > 0
        ? `Earliest availability starts ${earliestDate}. Found ${collected.length} slot(s). Each slot has startTime — copy that EXACT startTime into book_appointment date_time when the client picks a time.`
        : `No open slots in the next ${datesChecked.length} business day(s) checked (from today). Try a different treatment duration or practitioner.`;

    return { slots: collected, earliestDate, datesChecked, summary };
  }, request);
}
