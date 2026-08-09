/**
 * Pure T-24h tolerance-band check for the form-reminder cron — mirrors reminderWindow()'s shape
 * in src/lib/retention/reminders.ts (a single window instead of three). Kept in its own file, free
 * of any Supabase/email imports, so it stays unit-testable: reminders.ts pulls in sendRetentionEmail
 * (which transitively imports the "server-only" package via email-send-log.ts), which is not
 * installed as a real dependency here and breaks vitest for anything that imports it.
 */
export const FORM_REMINDER_HOURS_BEFORE = 24;
const WINDOW_LOWER = FORM_REMINDER_HOURS_BEFORE - 4; // 20
const WINDOW_UPPER = FORM_REMINDER_HOURS_BEFORE + 4; // 28

export function isWithinFormReminderWindow(hoursUntilAppointment: number): boolean {
  return hoursUntilAppointment >= WINDOW_LOWER && hoursUntilAppointment <= WINDOW_UPPER;
}
