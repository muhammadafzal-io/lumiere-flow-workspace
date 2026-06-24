/** Auto-send schedule stored in Rules.Trigger Config JSON under `schedule`. */
export type RuleScheduleInterval = "once" | "daily" | "weekly" | "monthly";
export type RuleSendMode = "all_eligible" | "once_per_client";

export interface RuleScheduleConfig {
  enabled: boolean;
  interval: RuleScheduleInterval;
  /** Local time HH:mm (24h), default 09:00 */
  run_at?: string;
  timezone?: string;
  /** 0=Sunday … 6=Saturday (weekly) */
  day_of_week?: number;
  /** 1–28 (monthly) */
  day_of_month?: number;
  /** Skip clients already emailed for this rule */
  send_mode?: RuleSendMode;
  /** Set by cron after each auto-run */
  last_auto_run_at?: string;
}

export const DEFAULT_RULE_SCHEDULE: RuleScheduleConfig = {
  enabled: false,
  interval: "daily",
  run_at: "09:00",
  timezone: "America/Chicago",
  day_of_week: 1,
  day_of_month: 1,
  send_mode: "once_per_client",
};

export function parseRuleSchedule(raw: unknown): RuleScheduleConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_RULE_SCHEDULE };
  const s = raw as Partial<RuleScheduleConfig>;
  return {
    enabled: !!s.enabled,
    interval:
      s.interval === "once" ||
      s.interval === "daily" ||
      s.interval === "weekly" ||
      s.interval === "monthly"
        ? s.interval
        : "daily",
    run_at: /^\d{2}:\d{2}$/.test(s.run_at ?? "") ? s.run_at : "09:00",
    timezone: s.timezone ?? "America/Chicago",
    day_of_week:
      typeof s.day_of_week === "number" && s.day_of_week >= 0 && s.day_of_week <= 6
        ? s.day_of_week
        : 1,
    day_of_month:
      typeof s.day_of_month === "number" && s.day_of_month >= 1 && s.day_of_month <= 28
        ? s.day_of_month
        : 1,
    send_mode: s.send_mode === "all_eligible" ? "all_eligible" : "once_per_client",
    last_auto_run_at: s.last_auto_run_at,
  };
}

function partsInTz(now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    dayOfMonth: Number(get("day")),
    dayOfWeek: weekdayMap[get("weekday")] ?? 0,
  };
}

function parseRunAt(runAt: string): { hour: number; minute: number } {
  const [h, m] = runAt.split(":").map(Number);
  return { hour: h ?? 9, minute: m ?? 0 };
}

function isPastRunTime(now: Date, schedule: RuleScheduleConfig): boolean {
  const tz = schedule.timezone ?? "America/Chicago";
  const { hour, minute } = partsInTz(now, tz);
  const target = parseRunAt(schedule.run_at ?? "09:00");
  return hour > target.hour || (hour === target.hour && minute >= target.minute);
}

function lastRunDateKey(lastIso: string | undefined, timeZone: string): string | null {
  if (!lastIso) return null;
  return partsInTz(new Date(lastIso), timeZone).dateKey;
}

/** Returns true when cron should execute this rule now. */
export function isRuleScheduleDue(schedule: RuleScheduleConfig, now = new Date()): boolean {
  if (!schedule.enabled) return false;

  const tz = schedule.timezone ?? "America/Chicago";
  if (!isPastRunTime(now, schedule)) return false;

  const today = partsInTz(now, tz);
  const lastKey = lastRunDateKey(schedule.last_auto_run_at, tz);

  switch (schedule.interval) {
    case "once":
      return !schedule.last_auto_run_at;
    case "daily":
      return lastKey !== today.dateKey;
    case "weekly":
      return today.dayOfWeek === (schedule.day_of_week ?? 1) && lastKey !== today.dateKey;
    case "monthly":
      return today.dayOfMonth === (schedule.day_of_month ?? 1) && lastKey !== today.dateKey;
    default:
      return false;
  }
}

export function scheduleSummary(schedule: RuleScheduleConfig): string {
  if (!schedule.enabled) return "Manual send only";
  const time = schedule.run_at ?? "09:00";
  const mode =
    schedule.send_mode === "all_eligible" ? "re-send to full audience" : "once per client";
  switch (schedule.interval) {
    case "once":
      return `One-time auto-send at ${time} CT (${mode})`;
    case "daily":
      return `Daily at ${time} CT (${mode})`;
    case "weekly": {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return `Weekly ${days[schedule.day_of_week ?? 1]} at ${time} CT (${mode})`;
    }
    case "monthly":
      return `Monthly on day ${schedule.day_of_month ?? 1} at ${time} CT (${mode})`;
    default:
      return "Scheduled";
  }
}
