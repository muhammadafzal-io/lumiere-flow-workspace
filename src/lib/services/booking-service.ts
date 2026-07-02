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
  addChicagoDays,
  isSundayChicago,
  nextOpenChicagoDay,
  todayInChicago,
} from "@/lib/booking/dates";

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

/**
 * Check availability with room and practitioner awareness
 * Returns all available room+practitioner combinations for a given date
 */
export async function checkAvailability(request: AvailabilityRequest): Promise<AvailabilityResult> {
  const { date, durationMinutes = 60, practitionerName, room } = request;

  // Get all available slots, optionally filtered by practitioner/room
  const practitioners = practitionerName ? [practitionerName] : [];
  const rooms = room ? [room] : undefined;

  const slots = await getAvailableSlots(date, durationMinutes, rooms, practitioners);

  // Collect all unique available practitioners and rooms across all slots
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

  // Validate business hours (9 AM - 7 PM, no Sundays)
  const startDate = new Date(request.startTime);
  const dayOfWeek = startDate.getDay();
  const hours = startDate.getHours();

  if (dayOfWeek === 0) {
    throw new Error("Appointments cannot be booked on Sundays — clinic is closed");
  }

  if (hours < 9 || hours >= 19) {
    throw new Error("Appointments can only be booked between 9:00 AM and 7:00 PM");
  }

  // Check if this room+practitioner combo is actually available
  const date = request.startTime.split("T")[0];
  const duration = Math.round(
    (new Date(request.endTime).getTime() - new Date(request.startTime).getTime()) / 60000,
  );

  const availability = await checkAvailability({
    date,
    durationMinutes: duration,
    practitionerName: request.practitionerName,
    room: request.room,
  });

  // Find a slot that matches the requested time
  const requestedSlot = availability.slots.find(
    (slot) =>
      slot.startTime === request.startTime &&
      slot.availablePractitioners?.includes(request.practitionerName) &&
      slot.availableRooms?.includes(request.room),
  );

  if (!requestedSlot) {
    // The requested time is no longer available
    const availableSlots = availability.slots
      .filter((s) => s.availablePractitioners?.includes(request.practitionerName))
      .filter((s) => s.availableRooms?.includes(request.room))
      .slice(0, 3)
      .map((s) => `${s.displayTime}`)
      .join(", ");

    throw new Error(
      availableSlots
        ? `${request.room} with ${request.practitionerName} is not available at that time. Try: ${availableSlots}`
        : `${request.room} with ${request.practitionerName} has no availability on ${date}`,
    );
  }

  // Book via the same function both admin and agent use
  const result = await bookAdminAppointment({
    startTime: request.startTime,
    endTime: request.endTime,
    clientName: request.clientName,
    clientContact: request.clientContact,
    clientEmail: request.clientEmail,
    treatment: request.treatment,
    room: request.room,
    practitionerName: request.practitionerName,
    notes: request.notes,
  });

  return {
    id: result.id,
    clientName: request.clientName,
    treatment: request.treatment,
    startTime: request.startTime,
    endTime: request.endTime,
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
      ? `Earliest availability starts ${earliestDate}. Found ${collected.length} slot(s) across ${datesChecked.length} day(s) checked (from today forward). Present these times to the client — do not skip to later dates if earlier slots exist.`
      : `No open slots in the next ${datesChecked.length} business day(s) checked (from today). Try a different treatment duration or practitioner.`;

  return { slots: collected, earliestDate, datesChecked, summary };
}
