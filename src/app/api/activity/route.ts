import { NextRequest, NextResponse } from "next/server";
import { readActivityLog } from "@/lib/integrations/activity-log";
import { getEventsByRange } from "@/lib/integrations/google-calendar";
import { requireApiPermission } from "@/lib/rbac/guard";
import { getClinicTimezone } from "@/lib/clinic-config";
import {
  calEventToLogRow,
  dedupeCalendarAgainstLog,
  type LogRow,
} from "@/lib/activity/merge-timeline";

export const dynamic = "force-dynamic";

function dateOffset(days: number, tz: string): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: tz });
}

export async function GET(req: NextRequest) {
  const check = await requireApiPermission("activity", "View");
  if (!check.ok) return check.response;

  const tz = await getClinicTimezone();
  const { searchParams } = req.nextUrl;
  const limit = Math.min(Number(searchParams.get("limit") ?? "500"), 1000);
  const eventType = searchParams.get("eventType") ?? "all";
  const status = searchParams.get("status") ?? "all";
  const platform = searchParams.get("platform") ?? "all";

  const from = dateOffset(-60, tz); // past 60 days
  const to = dateOffset(14, tz); // next 14 days

  const [logResult, calResult] = await Promise.allSettled([
    readActivityLog(limit),
    getEventsByRange(from, to),
  ]);

  // Supabase activity entries
  const logEntries: LogRow[] = logResult.status === "fulfilled" ? logResult.value : [];

  // Calendar events converted to log rows
  const calEntries: LogRow[] =
    calResult.status === "fulfilled" ? calResult.value.map((e) => calEventToLogRow(e, tz)) : [];

  // Deduplicate calendar events that already have a matching log entry
  const uniqueCalEntries = dedupeCalendarAgainstLog(logEntries, calEntries);

  // Combine and sort newest first
  let entries: LogRow[] = [...logEntries, ...uniqueCalEntries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // Apply filters
  if (eventType !== "all") entries = entries.filter((e) => e.eventType === eventType);
  if (status !== "all") entries = entries.filter((e) => e.status === status);
  if (platform !== "all")
    entries = entries.filter((e) => e.platform.toLowerCase() === platform.toLowerCase());

  entries = entries.slice(0, limit);

  return NextResponse.json({ entries, total: entries.length });
}
