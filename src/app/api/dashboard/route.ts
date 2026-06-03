import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { readActivityLog } from "@/lib/integrations/activity-log";
import { getEventsByRange } from "@/lib/integrations/google-calendar";

export const dynamic = "force-dynamic";

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function dateStr(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

async function fetchClients() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("Clients")
    .select("*");
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
    } catch {}
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
  try {
    const [clients, rules, recentActivity, calendarEvents] = await Promise.allSettled([
      fetchClients(),
      fetchRules(),
      readActivityLog(8),
      getEventsByRange(todayStr(), dateStr(7)),
    ]);

    const clientList = clients.status === "fulfilled" ? clients.value : [];
    const ruleList = rules.status === "fulfilled" ? rules.value : [];
    const activity = recentActivity.status === "fulfilled" ? recentActivity.value : [];
    const events = calendarEvents.status === "fulfilled" ? calendarEvents.value : [];

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
      calendarEvents: events,
    });
  } catch (error) {
    console.error("Dashboard API Error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
