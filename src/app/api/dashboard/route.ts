import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { readActivityLog } from "@/lib/integrations/activity-log";
import { getEventsByRange } from "@/lib/integrations/google-calendar";
import { requireApiPermission } from "@/lib/rbac/guard";
import type { OpsLogEntry } from "@/types";

export const dynamic = "force-dynamic";

type LogRow = OpsLogEntry & { id: string };

function dateStr(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

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
    const [clients, rules, recentActivity, calendarEvents] = await Promise.allSettled([
      fetchClients(),
      fetchRules(),
      readActivityLog(50),
      getEventsByRange(dateStr(-60), dateStr(7)),
    ]);

    const clientList = clients.status === "fulfilled" ? clients.value : [];
    const ruleList = rules.status === "fulfilled" ? rules.value : [];
    const logEntries: LogRow[] = recentActivity.status === "fulfilled" ? recentActivity.value : [];
    const events = calendarEvents.status === "fulfilled" ? calendarEvents.value : [];

    // Convert past+upcoming calendar events to log rows and merge
    const calEntries: LogRow[] = events.map(calEventToLogRow);
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

    // Only upcoming events for the mini calendar
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingEvents = events.filter((e) => new Date(e.startTime) >= today);

    const totalCustomers = clientList.length;
    const activeCustomers = clientList.filter((c: any) => c["Status"] === "Active").length;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const isThisMonth = (d: string | null) => {
      if (!d) return false;
      const date = new Date(d);
      return (
        !isNaN(date.getTime()) &&
        date.getMonth() === currentMonth &&
        date.getFullYear() === currentYear
      );
    };

    let messagesSentThisMonth = 0;
    clientList.forEach((c: any) => {
      if (isThisMonth(c["Last Reminder Sent"])) messagesSentThisMonth++;
      if (isThisMonth(c["Last Reactivation Sent"])) messagesSentThisMonth++;
    });

    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sundayEnd = new Date(monday.getTime() + 7 * 86400000 - 1);
    const lastMonday = new Date(monday.getTime() - 7 * 86400000);

    const appointmentsThisWeek = events.filter((e) => {
      const t = new Date(e.startTime).getTime();
      return t >= monday.getTime() && t <= sundayEnd.getTime();
    }).length;

    const appointmentsLastWeek = events.filter((e) => {
      const t = new Date(e.startTime).getTime();
      return t >= lastMonday.getTime() && t < monday.getTime();
    }).length;

    // Filter events to only the next 7 days for the mini calendar
    const calendarEvents7 = upcomingEvents.filter((e) => {
      const t = new Date(e.startTime).getTime();
      return t <= new Date(today.getTime() + 7 * 86400000).getTime();
    });

    const activeRulesCount = ruleList.filter((r: any) => r.status === "active").length;

    return NextResponse.json({
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
    console.error("Dashboard API Error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
