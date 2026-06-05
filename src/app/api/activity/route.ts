/* eslint-disable prettier/prettier */
import { NextRequest, NextResponse } from "next/server";
import { readActivityLog } from "@/lib/integrations/activity-log";
import { getEventsByRange } from "@/lib/integrations/google-calendar";
import type { OpsLogEntry } from "@/types";

export const dynamic = "force-dynamic";

type LogRow = OpsLogEntry & { id: string };

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

// Convert a Google Calendar event into the same shape as an Activity_Log row
function calEventToLogRow(e: {
  id: string;
  treatment: string;
  clientName: string;
  clientContact: string;
  startTime: string;
  endTime: string;
  notes: string;
  room: string;
  practitioner: string;
}): LogRow {
  const parts: string[] = [];
  if (e.treatment) parts.push(e.treatment);
  if (e.practitioner) parts.push(`with ${e.practitioner}`);
  if (e.room) parts.push(`in ${e.room}`);
  const apptTime = new Date(e.startTime).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  parts.push(`on ${apptTime}`);

  return {
    id: `cal_${e.id}`,
    timestamp: e.startTime,
    eventType: "booking",
    clientName: e.clientName || "Unknown",
    phone: e.clientContact || "",
    email: "",
    clientId: "",
    details: parts.join(" "),
    status: "success",
    platform: "calendar",
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const limit = Math.min(Number(searchParams.get("limit") ?? "500"), 1000);
  const eventType = searchParams.get("eventType") ?? "all";
  const status = searchParams.get("status") ?? "all";
  const platform = searchParams.get("platform") ?? "all";

  const from = dateOffset(-60); // past 60 days
  const to = dateOffset(14); // next 14 days

  const [logResult, calResult] = await Promise.allSettled([
    readActivityLog(limit),
    getEventsByRange(from, to),
  ]);

  // Supabase activity entries
  const logEntries: LogRow[] = logResult.status === "fulfilled" ? logResult.value : [];

  // Calendar events converted to log rows
  const calEntries: LogRow[] =
    calResult.status === "fulfilled" ? calResult.value.map(calEventToLogRow) : [];

  // Merge: deduplicate calendar events that already have a matching log entry
  // (match by clientName + approximate time within 5 minutes)
  const logSet = new Set(
    logEntries
      .filter((e) => e.eventType === "booking")
      .map((e) => {
        const t = new Date(e.timestamp).getTime();
        return `${e.clientName.toLowerCase()}_${Math.round(t / 300000)}`;
      }),
  );

  const uniqueCalEntries = calEntries.filter((e) => {
    const t = new Date(e.timestamp).getTime();
    return !logSet.has(`${e.clientName.toLowerCase()}_${Math.round(t / 300000)}`);
  });

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
