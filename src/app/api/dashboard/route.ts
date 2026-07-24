import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { readActivityLog } from "@/lib/integrations/activity-log";
import { getEventsByRange } from "@/lib/integrations/google-calendar";
import { requireApiPermission } from "@/lib/rbac/guard";
import type { OpsLogEntry } from "@/types";
import { getClinicTimezone } from "@/lib/clinic-config";
import { dateInZone, addDays } from "@/lib/booking/dates";

export const dynamic = "force-dynamic";

type LogRow = OpsLogEntry & { id: string };

function dateStr(offsetDays: number, tz: string) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA", { timeZone: tz });
}

function calEventToLogRow(
  e: {
    id: string;
    treatment: string;
    clientName: string;
    clientContact: string;
    startTime: string;
    endTime: string;
    notes: string;
    room: string;
    practitioner: string;
  },
  tz: string,
): LogRow {
  const parts: string[] = [];
  if (e.treatment) parts.push(e.treatment);
  if (e.practitioner) parts.push(`with ${e.practitioner}`);
  if (e.room) parts.push(`in ${e.room}`);
  const apptTime = new Date(e.startTime).toLocaleString("en-US", {
    timeZone: tz,
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

async function fetchClients() {
  const sb = getSupabase();
  const { data, error } = await sb.from("Clients").select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchRules() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("Rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((r: any) => {
    let trigger_config: Record<string, any> = {};
    try {
      trigger_config = JSON.parse(r["Trigger Config"] ?? "{}");
    } catch (_) {
      // ignore JSON parse errors; trigger_config stays {}
    }
    return {
      id: r.id,
      name: r["Rule Name"] ?? "",
      status: (r["Status"] ?? "draft").toLowerCase(),
      trigger_type: r["Trigger Type"] ?? "Inactivity",
      trigger_config,
      channel: r["Channel"] ?? "WhatsApp",
      message_template: r["Message Template"] ?? "",
      offer_code: r["Incentive Code"] || undefined,
      audience_filter: [],
      created_at: r.created_at,
      audience_size: 0,
      sent_30d: 0,
      reply_rate: 0,
      revenue: 0,
    };
  });
}

export async function GET() {
  const check = await requireApiPermission("dashboard", "View");
  if (!check.ok) return check.response;

  try {
    const tz = await getClinicTimezone();
    const rangeFrom = dateStr(-60, tz);
    const rangeTo = dateStr(7, tz);
    const [clients, rules, recentActivity, calendarEvents] = await Promise.allSettled([
      fetchClients(),
      fetchRules(),
      readActivityLog(50),
      getEventsByRange(rangeFrom, rangeTo),
    ]);

    const clientList = clients.status === "fulfilled" ? clients.value : [];
    const ruleList = rules.status === "fulfilled" ? rules.value : [];
    const logEntries: LogRow[] = recentActivity.status === "fulfilled" ? recentActivity.value : [];
    const events = calendarEvents.status === "fulfilled" ? calendarEvents.value : [];

    // Convert past+upcoming calendar events to log rows and merge
    const calEntries: LogRow[] = events.map((e) => calEventToLogRow(e, tz));
    const logSet = new Set(
      logEntries
        .filter((e) => e.eventType === "booking")
        .map((e) => {
          const t = new Date(e.timestamp ?? 0).getTime();
          return `${(e.clientName ?? "").toLowerCase()}_${Math.round(t / 300000)}`;
        }),
    );
    const uniqueCalEntries = calEntries.filter((e) => {
      const t = new Date(e.timestamp ?? 0).getTime();
      return !logSet.has(`${(e.clientName ?? "").toLowerCase()}_${Math.round(t / 300000)}`);
    });
    let activity = [...logEntries, ...uniqueCalEntries]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);

    // Fallback: if both Activity_Log and Google Calendar are empty (e.g. credentials
    // not yet configured on this environment), synthesize activity from Clients table
    // using Last Visit and Last Reminder Sent fields — always works when Supabase is up.
    if (activity.length === 0 && clientList.length > 0) {
      const synthetic: LogRow[] = [];
      for (const c of clientList as any[]) {
        const name: string = c["Name"] ?? "Client";
        if (c["Last Visit"]) {
          const ts = new Date(c["Last Visit"]);
          if (!isNaN(ts.getTime())) {
            synthetic.push({
              id: `lv_${c.id}`,
              timestamp: ts.toISOString(),
              eventType: "booking",
              clientName: name,
              phone: c["Phone"] ?? "",
              email: c["Email"] ?? "",
              clientId: c.id,
              details: c["Last Treatment"] ? `${c["Last Treatment"]} appointment` : "Appointment",
              status: "success",
              platform: "calendar",
            });
          }
        }
        if (c["Last Reminder Sent"]) {
          const ts = new Date(c["Last Reminder Sent"]);
          if (!isNaN(ts.getTime())) {
            synthetic.push({
              id: `rm_${c.id}`,
              timestamp: ts.toISOString(),
              eventType: "reminder",
              clientName: name,
              phone: c["Phone"] ?? "",
              email: c["Email"] ?? "",
              clientId: c.id,
              details: "Appointment reminder sent",
              status: "success",
              platform: "whatsapp",
            });
          }
        }
        if (c["Last Reactivation Sent"]) {
          const ts = new Date(c["Last Reactivation Sent"]);
          if (!isNaN(ts.getTime())) {
            synthetic.push({
              id: `re_${c.id}`,
              timestamp: ts.toISOString(),
              eventType: "reactivation",
              clientName: name,
              phone: c["Phone"] ?? "",
              email: c["Email"] ?? "",
              clientId: c.id,
              details: "Reactivation message sent",
              status: "success",
              platform: "whatsapp",
            });
          }
        }
      }
      activity = synthetic
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 8);
    }

    // Only upcoming events for the mini calendar — bucketed by the CLINIC's calendar day, not
    // the server process's local timezone (e.g. UTC on Vercel), so "today" here always matches
    // what admin UI clients compute in the clinic's own configured timezone.
    const todayStr = dateStr(0, tz);
    const upcomingEvents = events.filter((e) => dateInZone(e.startTime, tz) >= todayStr);

    const totalCustomers = clientList.length;
    const activeCustomers = clientList.filter((c: any) => c["Status"] === "Active").length;

    const currentYearMonth = todayStr.slice(0, 7); // "YYYY-MM" in the clinic's timezone
    const isThisMonth = (d: string | null) => {
      if (!d || isNaN(new Date(d).getTime())) return false;
      return dateInZone(d, tz).slice(0, 7) === currentYearMonth;
    };

    let messagesSentThisMonth = 0;
    clientList.forEach((c: any) => {
      if (isThisMonth(c["Last Reminder Sent"])) messagesSentThisMonth++;
      if (isThisMonth(c["Last Reactivation Sent"])) messagesSentThisMonth++;
    });

    // Clinic-local day-of-week (0=Sun..6=Sat) for today's date string — the noon-UTC probe is
    // timezone-neutral since a date string alone has no wall-clock time to misread.
    const todayDow = new Date(`${todayStr}T12:00:00Z`).getUTCDay();
    const mondayStr = addDays(todayStr, -((todayDow + 6) % 7));
    const sundayStr = addDays(mondayStr, 6);
    const lastMondayStr = addDays(mondayStr, -7);
    const lastSundayStr = addDays(mondayStr, -1);

    const appointmentsThisWeek = events.filter((e) => {
      const d = dateInZone(e.startTime, tz);
      return d >= mondayStr && d <= sundayStr;
    }).length;

    const appointmentsLastWeek = events.filter((e) => {
      const d = dateInZone(e.startTime, tz);
      return d >= lastMondayStr && d <= lastSundayStr;
    }).length;

    // Filter events to only the next 7 days for the mini calendar
    const sevenDaysStr = addDays(todayStr, 7);
    const calendarEvents7 = upcomingEvents.filter(
      (e) => dateInZone(e.startTime, tz) <= sevenDaysStr,
    );

    const activeRulesCount = ruleList.filter((r: any) => r.status === "active").length;

    return NextResponse.json({
      timezone: tz,
      metrics: {
        totalCustomers,
        activeCustomers,
        activeRulesCount,
        messagesSentThisMonth,
        appointmentsThisWeek,
        appointmentsLastWeek,
      },
      recentActivity: activity,
      rules: ruleList,
      calendarEvents: calendarEvents7,
    });
  } catch (error) {
    console.error("Dashboard API Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
