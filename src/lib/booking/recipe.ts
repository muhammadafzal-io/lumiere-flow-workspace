/**
 * Resolves a Service's "recipe" (PRD §2/§6) — the room/equipment requirements and the pool
 * of qualified practitioners — into concrete candidates and per-resource scheduling data
 * that the booking engine (google-calendar.ts) can check against.
 */
import { getSupabase } from "@/lib/supabase";
import { zonedHourToUtc, type ResourceAvailabilityContext } from "@/lib/integrations/google-calendar";
import { dateInZone, daysBetweenDates } from "@/lib/booking/dates";
import {
  getClinicBusinessHours,
  hoursForWeekday,
  WEEKDAY_BY_UTC_DAY,
  type ClinicHoursSchedule,
} from "@/lib/booking/clinic-hours";

export interface ClosedTimeEntry {
  start: string;
  end: string;
  label?: string;
}

export interface WeeklyHours {
  mon?: { start: string; end: string };
  tue?: { start: string; end: string };
  wed?: { start: string; end: string };
  thu?: { start: string; end: string };
  fri?: { start: string; end: string };
  sat?: { start: string; end: string };
  sun?: { start: string; end: string };
}

type WeekdayKey = keyof WeeklyHours;

export type RoomRequirementRule =
  | { mode: "any_of_type"; roomType: string }
  | { mode: "specific"; roomIds: string[] };

export interface EquipmentRequirementRule {
  equipmentIds: string[];
}

export interface RoomRow {
  id: string;
  name: string;
  type: string;
  cleanupMinutes: number;
  status: string;
  closedTimes: ClosedTimeEntry[];
}

export interface EquipmentRow {
  id: string;
  name: string;
  type: string;
  homeRoom: string | null;
  cleanupMinutes: number;
  status: string;
  closedTimes: ClosedTimeEntry[];
}

export interface PractitionerRow {
  id: string;
  name: string;
  status: string;
  qualifications: string[];
  workingHours: WeeklyHours | null;
  breaks: WeeklyHours | null;
  timeOff: ClosedTimeEntry[];
}

export interface ServiceRow {
  id: string;
  name: string;
  durationMinutes: number;
  onlineBookable: boolean;
  requiresConsultation: boolean;
  minNoticeHours: number;
  maxAdvanceDays: number;
  status: string;
}

export interface ResolvedRecipe {
  service: ServiceRow;
  roomCandidates: RoomRow[];
  /** One entry per equipment requirement row — need one free item from each group. */
  equipmentGroups: EquipmentRow[][];
  /** Flattened union of every candidate across all equipment groups. */
  equipmentCandidates: EquipmentRow[];
  qualifiedPractitioners: PractitionerRow[];
}

function mapRoomRow(r: any): RoomRow {
  return {
    id: r.id,
    // Trimmed to match airtable.ts's rowToPractitioner (which already trims) — an untrimmed
    // "Dr John " vs a model-produced "Dr John" caused exact-string equality checks throughout
    // the recipe-aware booking path (qualification checks, availablePractitioners/availableRooms
    // membership) to fail even when the underlying data was actually correct.
    name: String(r["Name"] ?? "").trim(),
    type: r["Type"] ?? "Treatment",
    cleanupMinutes: r["CleanupMinutes"] ?? 0,
    status: r["Status"] ?? "Active",
    closedTimes: r["ClosedTimes"] ?? [],
  };
}

function mapEquipmentRow(r: any): EquipmentRow {
  return {
    id: r.id,
    name: String(r["Name"] ?? "").trim(),
    type: r["Type"] ?? "Mobile",
    homeRoom: r["HomeRoom"] ?? null,
    cleanupMinutes: r["CleanupMinutes"] ?? 0,
    status: r["Status"] ?? "Active",
    closedTimes: r["ClosedTimes"] ?? [],
  };
}

function mapPractitionerRow(r: any): PractitionerRow {
  return {
    id: r.id,
    name: String(r["Name"] ?? "").trim(),
    status: r["Status"] ?? "Active",
    qualifications: r["Qualifications"] ?? [],
    workingHours: r["WorkingHours"] ?? null,
    breaks: r["Breaks"] ?? null,
    timeOff: r["TimeOff"] ?? [],
  };
}

function mapServiceRow(r: any): ServiceRow {
  return {
    id: r.id,
    name: r["Name"] ?? "",
    durationMinutes: r["DurationMinutes"] ?? 60,
    onlineBookable: r["OnlineBookable"] ?? true,
    requiresConsultation: r["RequiresConsultation"] ?? false,
    minNoticeHours: r["MinNoticeHours"] ?? 0,
    maxAdvanceDays: r["MaxAdvanceDays"] ?? 365,
    status: r["Status"] ?? "Active",
  };
}

/**
 * Lists active Services, optionally filtered by a case-insensitive substring match on name.
 * Mirrors `getPractitioners` in `src/lib/integrations/airtable.ts` — the AI agent's
 * `get_services` tool uses this so it looks up the clinic's real treatment menu instead of
 * relying on a hardcoded list in the system prompt.
 */
export async function listActiveServices(query?: string): Promise<ServiceRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("Services").select("*").eq("Status", "Active");
  if (error) throw new Error(`listActiveServices: ${error.message}`);
  const all = (data ?? []).map(mapServiceRow);
  if (!query) return all;
  const term = query.toLowerCase();
  return all.filter((s) => s.name.toLowerCase().includes(term));
}

function resolveRoomCandidates(rule: RoomRequirementRule | null, rooms: RoomRow[]): RoomRow[] {
  const active = rooms.filter((r) => r.status === "Active");
  if (!rule) return active;
  if (rule.mode === "any_of_type") return active.filter((r) => r.type === rule.roomType);
  return active.filter((r) => rule.roomIds.includes(r.id));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loads a Service by id or by case-insensitive name, resolves its room/equipment
 * requirements against the live Rooms/Equipment tables, applies the "installed equipment
 * binds its room" rule, and filters Practitioners down to those qualified for this service.
 * Returns null when no matching (active) Service exists — callers should fall back to
 * legacy freeform booking in that case rather than treating it as an error.
 */
export async function resolveServiceRecipe(
  serviceIdOrName: string,
): Promise<ResolvedRecipe | null> {
  if (!serviceIdOrName?.trim()) return null;
  const sb = getSupabase();

  const serviceQuery = UUID_RE.test(serviceIdOrName)
    ? sb.from("Services").select("*").eq("id", serviceIdOrName).maybeSingle()
    : sb.from("Services").select("*").ilike("Name", serviceIdOrName).maybeSingle();

  const { data: serviceRow } = await serviceQuery;
  if (!serviceRow || serviceRow["Status"] === "Inactive") return null;

  const [
    { data: reqRows },
    { data: roomRows },
    { data: equipmentRows },
    { data: practitionerRows },
  ] = await Promise.all([
    sb.from("ServiceRequirements").select("*").eq("service_id", serviceRow.id),
    sb.from("Rooms").select("*"),
    sb.from("Equipment").select("*"),
    sb.from("Practitioners").select("*"),
  ]);

  const service = mapServiceRow(serviceRow);
  const rooms = (roomRows ?? []).map(mapRoomRow);
  const equipment = (equipmentRows ?? []).map(mapEquipmentRow);
  const practitioners = (practitionerRows ?? []).map(mapPractitionerRow);
  const requirements = reqRows ?? [];

  const roomReq = requirements.find((r: any) => r.kind === "room");
  const roomRule: RoomRequirementRule | null = roomReq
    ? (roomReq.rule as RoomRequirementRule)
    : null;
  let roomCandidates = resolveRoomCandidates(roomRule, rooms);

  const equipmentReqs = requirements.filter((r: any) => r.kind === "equipment");
  const equipmentGroups: EquipmentRow[][] = equipmentReqs.map((r: any) => {
    const rule = r.rule as EquipmentRequirementRule;
    const ids = rule?.equipmentIds ?? [];
    return equipment.filter((e) => e.status === "Active" && ids.includes(e.id));
  });

  // The most important equipment rule (PRD §4): installed equipment binds its own room —
  // never offer that machine paired with a different room.
  const installedHomeRooms = Array.from(
    new Set(
      equipmentGroups
        .flat()
        .filter((e) => e.type === "Installed" && e.homeRoom)
        .map((e) => e.homeRoom as string),
    ),
  );
  if (installedHomeRooms.length > 0) {
    roomCandidates = roomCandidates.filter((r) => installedHomeRooms.includes(r.name));
  }

  const qualifiedPractitioners = practitioners.filter(
    (p) => p.status === "Active" && p.qualifications.includes(service.id),
  );

  return {
    service,
    roomCandidates,
    equipmentGroups,
    equipmentCandidates: equipmentGroups.flat(),
    qualifiedPractitioners,
  };
}

function toFractionalHour(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h + (m || 0) / 60;
}

function parseZonedLocalDatetime(value: string, timezone: string): Date {
  const [datePart, timePart = "00:00"] = value.split("T");
  return zonedHourToUtc(datePart, toFractionalHour(timePart), timezone);
}

function closedTimesToRanges(entries: ClosedTimeEntry[] | null | undefined, timezone: string) {
  return (entries ?? [])
    .filter((e) => e.start && e.end)
    .map((e) => ({
      start: parseZonedLocalDatetime(e.start, timezone),
      end: parseZonedLocalDatetime(e.end, timezone),
    }));
}

function weekdayKeyForDate(date: string): WeekdayKey {
  const utcDay = new Date(`${date}T12:00:00Z`).getUTCDay();
  return WEEKDAY_BY_UTC_DAY[utcDay] as WeekdayKey;
}

/** Converts a practitioner's WorkingHours/Breaks/TimeOff into concrete busy UTC ranges for one date. Falls back to being busy the clinic's own full configured hours that weekday when the practitioner has no WorkingHours entry for it. */
function practitionerBusyRangesForDate(
  p: PractitionerRow,
  date: string,
  timezone: string,
  clinicSchedule: ClinicHoursSchedule,
) {
  const weekday = weekdayKeyForDate(date);
  const clinicHoursToday = hoursForWeekday(clinicSchedule, weekday);
  const ranges: { start: Date; end: Date }[] = [];

  if (p.workingHours && clinicHoursToday) {
    const dayStart = zonedHourToUtc(date, clinicHoursToday.startHour, timezone);
    const dayEnd = zonedHourToUtc(date, clinicHoursToday.endHour, timezone);
    const today = p.workingHours[weekday];
    if (!today) {
      ranges.push({ start: dayStart, end: dayEnd });
    } else {
      const workStart = zonedHourToUtc(date, toFractionalHour(today.start), timezone);
      const workEnd = zonedHourToUtc(date, toFractionalHour(today.end), timezone);
      if (workStart > dayStart) ranges.push({ start: dayStart, end: workStart });
      if (workEnd < dayEnd) ranges.push({ start: workEnd, end: dayEnd });
    }
  }

  const brk = p.breaks?.[weekday];
  if (brk) {
    ranges.push({
      start: zonedHourToUtc(date, toFractionalHour(brk.start), timezone),
      end: zonedHourToUtc(date, toFractionalHour(brk.end), timezone),
    });
  }

  ranges.push(...closedTimesToRanges(p.timeOff, timezone));
  return ranges;
}

export interface RecipeAvailabilityInputs {
  roomNames: string[];
  practitionerNames: string[];
  /** One group per equipment requirement — pass straight through to getAvailableSlots. */
  equipmentGroups: string[][];
  context: ResourceAvailabilityContext;
}

/** Turns a resolved recipe into the room/practitioner/equipment name lists + per-resource scheduling context that `getAvailableSlots`/`bookAdminAppointment` consume, for one specific calendar date. */
export async function buildAvailabilityInputs(
  recipe: ResolvedRecipe,
  date: string,
  timezone: string,
): Promise<RecipeAvailabilityInputs> {
  const clinicSchedule = await getClinicBusinessHours();

  const roomCleanupMinutes: Record<string, number> = {};
  const roomExtraBusy: Record<string, { start: Date; end: Date }[]> = {};
  for (const r of recipe.roomCandidates) {
    roomCleanupMinutes[r.name] = r.cleanupMinutes;
    roomExtraBusy[r.name] = closedTimesToRanges(r.closedTimes, timezone);
  }

  const equipmentCleanupMinutes: Record<string, number> = {};
  const equipmentExtraBusy: Record<string, { start: Date; end: Date }[]> = {};
  for (const e of recipe.equipmentCandidates) {
    equipmentCleanupMinutes[e.name] = e.cleanupMinutes;
    equipmentExtraBusy[e.name] = closedTimesToRanges(e.closedTimes, timezone);
  }

  const practitionerExtraBusy: Record<string, { start: Date; end: Date }[]> = {};
  for (const p of recipe.qualifiedPractitioners) {
    practitionerExtraBusy[p.name] = practitionerBusyRangesForDate(p, date, timezone, clinicSchedule);
  }

  return {
    roomNames: recipe.roomCandidates.map((r) => r.name),
    practitionerNames: recipe.qualifiedPractitioners.map((p) => p.name),
    equipmentGroups: recipe.equipmentGroups.map((group) => group.map((e) => e.name)),
    context: {
      roomCleanupMinutes,
      roomExtraBusy,
      equipmentCleanupMinutes,
      equipmentExtraBusy,
      practitionerExtraBusy,
    },
  };
}

/** Checks a Service's MinNoticeHours/MaxAdvanceDays against a requested start time. Returns an error message, or null if within the allowed booking window. */
export function checkServiceBookingWindow(
  service: ServiceRow,
  startTimeIso: string,
  timezone: string,
): string | null {
  const now = Date.now();
  const start = new Date(startTimeIso).getTime();

  const minNoticeMs = service.minNoticeHours * 60 * 60_000;
  if (start - now < minNoticeMs) {
    return `${service.name} requires at least ${service.minNoticeHours} hour(s) of notice`;
  }

  // Compared by calendar day in the clinic's timezone, not raw elapsed milliseconds — otherwise
  // maxAdvanceDays: 0 (meant as "same day only") would reject every future instant, since any
  // positive millisecond difference exceeds a zero threshold, making the service permanently
  // unbookable whenever minNoticeHours > 0 (which is exactly the "no availability for weeks" bug).
  const daysAhead = daysBetweenDates(
    dateInZone(new Date(now), timezone),
    dateInZone(new Date(start), timezone),
  );
  if (daysAhead > service.maxAdvanceDays) {
    return `${service.name} cannot be booked more than ${service.maxAdvanceDays} day(s) in advance`;
  }

  return null;
}

/** The room-cleanup / equipment-cleanup minutes to use for a specific booked room+equipment pair, for bookAdminAppointment's conflict re-check. */
export function resolveBookingCleanup(
  recipe: ResolvedRecipe,
  roomName: string,
  equipmentNames: string[] | undefined,
): { roomCleanupMinutes?: number; equipmentCleanupMinutes?: number } {
  const room = recipe.roomCandidates.find((r) => r.name === roomName);
  const equipmentCleanup = (equipmentNames ?? [])
    .map((name) => recipe.equipmentCandidates.find((e) => e.name === name)?.cleanupMinutes)
    .filter((n): n is number => n !== undefined);

  return {
    roomCleanupMinutes: room?.cleanupMinutes,
    equipmentCleanupMinutes:
      equipmentCleanup.length > 0 ? Math.max(...equipmentCleanup) : undefined,
  };
}
