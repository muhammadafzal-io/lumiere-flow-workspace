/**
 * Resolves a Service's "recipe" (PRD §2/§6) — the room/equipment requirements and the pool
 * of qualified practitioners — into concrete candidates and per-resource scheduling data
 * that the booking engine (google-calendar.ts) can check against.
 */
import { getSupabase } from "@/lib/supabase";
import {
  zonedHourToUtc,
  type ResourceAvailabilityContext,
} from "@/lib/integrations/google-calendar";
import { dateInZone, daysBetweenDates } from "@/lib/booking/dates";
import {
  getClinicBusinessHours,
  hoursForWeekday,
  WEEKDAY_BY_UTC_DAY,
  type ClinicHoursSchedule,
} from "@/lib/booking/clinic-hours";
import { createFormResponseLink } from "@/lib/forms/response-link";

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
  /** Room names required by this service's own room rule (type/specific list), before the
   * installed-equipment-binding filter narrows it further — lets callers distinguish "wrong room
   * type" from "right type, but missing this service's required installed equipment" when
   * building a warning message. Same as roomCandidates when no installed equipment is required. */
  roomCandidatesBeforeEquipmentBinding: RoomRow[];
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
  const roomCandidatesBeforeEquipmentBinding = resolveRoomCandidates(roomRule, rooms);
  let roomCandidates = roomCandidatesBeforeEquipmentBinding;

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
    roomCandidatesBeforeEquipmentBinding,
  };
}

/**
 * `resolveServiceRecipe` returns null both when no Service matches `serviceIdOrName` at all
 * (a real, intentional case — callers fall back to legacy freeform booking for treatments not
 * yet configured as a Service) *and* when a Service matches but is Inactive. Those two cases
 * must not be treated the same: falling back to freeform booking for a deliberately-deactivated
 * service means it loses every protection its recipe would have enforced — qualification,
 * room/equipment requirements, onlineBookable, requiresConsultation, the booking window — while
 * still being bookable by name. This distinguishes the second case so callers can hard-block it
 * instead of silently downgrading it to an unrestricted freeform booking.
 */
export async function findInactiveService(serviceIdOrName: string): Promise<ServiceRow | null> {
  if (!serviceIdOrName?.trim()) return null;
  const sb = getSupabase();
  const serviceQuery = UUID_RE.test(serviceIdOrName)
    ? sb.from("Services").select("*").eq("id", serviceIdOrName).maybeSingle()
    : sb.from("Services").select("*").ilike("Name", serviceIdOrName).maybeSingle();
  const { data: serviceRow } = await serviceQuery;
  if (!serviceRow || serviceRow["Status"] !== "Inactive") return null;
  return mapServiceRow(serviceRow);
}

/** Resolves a Service's id from either a UUID or a name (exact match, falling back to a
 * substring-containment match) — shared by getInHouseFormLinks and src/lib/waitlist/store.ts. */
export async function resolveServiceId(
  sb: ReturnType<typeof getSupabase>,
  treatmentNameOrId: string,
): Promise<string | null> {
  if (UUID_RE.test(treatmentNameOrId)) {
    const { data } = await sb
      .from("Services")
      .select("id")
      .eq("id", treatmentNameOrId)
      .maybeSingle();
    return data?.id ?? null;
  }
  const { data: exact } = await sb
    .from("Services")
    .select("id")
    .ilike("Name", treatmentNameOrId)
    .maybeSingle();
  return exact?.id ?? (await matchServiceByNameContainedIn(sb, treatmentNameOrId));
}

/**
 * Fallback for `resolveServiceId` when a treatment string doesn't exactly match a Service's
 * name — e.g. the AI or a staff member records "Consultation for Microneedling" rather than the
 * bare service name "Microneedling". Finds active Services whose name appears as a whole
 * substring of the treatment text, preferring the longest match to avoid a short name (e.g.
 * "Facial") accidentally matching inside an unrelated longer one.
 */
async function matchServiceByNameContainedIn(
  sb: ReturnType<typeof getSupabase>,
  treatment: string,
): Promise<string | null> {
  const { data } = await sb.from("Services").select("id, Name").eq("Status", "Active");
  const lowerTreatment = treatment.toLowerCase();
  const matches = (data ?? [])
    .filter((s: any) => {
      const name = String(s["Name"] ?? "")
        .trim()
        .toLowerCase();
      return name.length > 0 && lowerTreatment.includes(name);
    })
    .sort((a: any, b: any) => String(b["Name"]).length - String(a["Name"]).length);
  return matches[0]?.id ?? null;
}

export interface InHouseFormLink {
  formName: string;
  url: string;
  formResponseId: string;
}

/**
 * Mints a fresh single-use fill-out link (src/lib/forms/response-link.ts) for every Active
 * in-house Form attached to a Service via ServiceFormAssignments. Used by the booking-
 * confirmation email. Never throws — returns [] on any failure, since this is a non-critical
 * enhancement layered onto a critical send path.
 */
export async function getInHouseFormLinks(
  treatmentNameOrId: string,
  eventId: string,
  appointmentStartTime: string,
  phone: string,
  clientName?: string,
  clientId?: string | null,
): Promise<InHouseFormLink[]> {
  if (!treatmentNameOrId?.trim() || !eventId) return [];
  try {
    const sb = getSupabase();
    const serviceId = await resolveServiceId(sb, treatmentNameOrId);
    if (!serviceId) return [];

    const { data: assignments } = await sb
      .from("ServiceFormAssignments")
      .select("form_id")
      .eq("service_id", serviceId);
    const formIds = (assignments ?? []).map((a: any) => a.form_id);
    if (formIds.length === 0) return [];

    const { data: formRows } = await sb
      .from("Forms")
      .select("id, name")
      .in("id", formIds)
      .eq("status", "Active");
    if (!formRows || formRows.length === 0) return [];

    return await Promise.all(
      formRows.map(async (f: any) => {
        const { id, url } = await createFormResponseLink({
          formId: f.id,
          serviceId,
          eventId,
          phone,
          clientName,
          clientId,
          appointmentStartTime,
        });
        return { formName: f.name, url, formResponseId: id };
      }),
    );
  } catch {
    return [];
  }
}

/** Renders the in-house-forms block as plain-text lines, or [] when there are none. */
export function formatInHouseFormLinks(links: InHouseFormLink[]): string[] {
  if (links.length === 0) return [];
  return ["", "Please complete before your visit:", ...links.map((l) => `${l.formName}: ${l.url}`)];
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
    // Installed equipment "sits inside the room, so it is blocked while the room is being
    // cleaned" (PRD §7) — its effective turnover buffer can never be shorter than its own home
    // room's, even if configured lower, or the equipment would show free while the room it
    // physically lives in is still mid-cleanup.
    const homeRoomBuffer =
      e.type === "Installed" && e.homeRoom ? (roomCleanupMinutes[e.homeRoom] ?? 0) : 0;
    equipmentCleanupMinutes[e.name] = Math.max(e.cleanupMinutes, homeRoomBuffer);
    equipmentExtraBusy[e.name] = closedTimesToRanges(e.closedTimes, timezone);
  }

  const practitionerExtraBusy: Record<string, { start: Date; end: Date }[]> = {};
  for (const p of recipe.qualifiedPractitioners) {
    practitionerExtraBusy[p.name] = practitionerBusyRangesForDate(
      p,
      date,
      timezone,
      clinicSchedule,
    );
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
    .map((name) => recipe.equipmentCandidates.find((e) => e.name === name))
    .filter((e): e is EquipmentRow => e !== undefined)
    .map((e) => {
      // Same rule as buildAvailabilityInputs (PRD §7): installed equipment can't show a shorter
      // turnover than the room it physically sits in, or the final booking-time conflict check
      // would use a weaker buffer than what the availability query already offered slots against.
      const homeRoomBuffer =
        e.type === "Installed" && e.homeRoom
          ? (recipe.roomCandidates.find((r) => r.name === e.homeRoom)?.cleanupMinutes ?? 0)
          : 0;
      return Math.max(e.cleanupMinutes, homeRoomBuffer);
    });

  return {
    roomCleanupMinutes: room?.cleanupMinutes,
    equipmentCleanupMinutes:
      equipmentCleanup.length > 0 ? Math.max(...equipmentCleanup) : undefined,
  };
}

/**
 * Settings-side dependency guards (PRD gap R-2): a room, an equipment item, or a practitioner's
 * qualification can be the *only* thing satisfying some active Service's recipe. Deleting or
 * deactivating it then silently drops that service to zero bookable slots, with no error message
 * pointing at the cause. These check "would this change leave an active service with nothing
 * left to offer" before the caller commits the change, so Settings can surface a clear warning
 * instead. Each returns the names of affected active services (empty = safe to proceed).
 */

async function resolveActiveRecipes(): Promise<ResolvedRecipe[]> {
  const services = await listActiveServices();
  const recipes = await Promise.all(services.map((s) => resolveServiceRecipe(s.id)));
  return recipes.filter((r): r is ResolvedRecipe => r !== null);
}

export async function activeServicesThatWouldLoseAllRooms(
  excludeRoomId: string,
): Promise<string[]> {
  const recipes = await resolveActiveRecipes();
  return recipes
    .filter(
      (r) =>
        r.roomCandidates.length > 0 && r.roomCandidates.every((room) => room.id === excludeRoomId),
    )
    .map((r) => r.service.name);
}

export async function activeServicesThatWouldLoseAnEquipmentGroup(
  excludeEquipmentId: string,
): Promise<string[]> {
  const recipes = await resolveActiveRecipes();
  return recipes
    .filter((r) =>
      r.equipmentGroups.some(
        (group) => group.length > 0 && group.every((e) => e.id === excludeEquipmentId),
      ),
    )
    .map((r) => r.service.name);
}

export async function activeServicesThatWouldLoseAllPractitioners(
  excludePractitionerId: string,
): Promise<string[]> {
  const recipes = await resolveActiveRecipes();
  return recipes
    .filter(
      (r) =>
        r.qualifiedPractitioners.length > 0 &&
        r.qualifiedPractitioners.every((p) => p.id === excludePractitionerId),
    )
    .map((r) => r.service.name);
}
