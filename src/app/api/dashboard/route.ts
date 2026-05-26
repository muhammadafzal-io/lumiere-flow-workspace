/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { readOpsLog } from "@/lib/integrations/google-sheets";
import { getEventsByRange } from "@/lib/integrations/google-calendar";

export const dynamic = "force-dynamic";

const RULES_TABLE = "Rules";
const CLIENTS_TABLE = "Clients";

function airtableBase() {
  const token = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  return { token, baseId };
}

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

// ── Fetch clients from Airtable ──────────────────────────────────────────────
async function fetchClients() {
  const { token, baseId } = airtableBase();
  const allRecords: any[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${CLIENTS_TABLE}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Airtable clients error: ${res.status}`);
    const data = await res.json();
    allRecords.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return allRecords.map((r) => r.fields);
}

// ── Fetch rules from Airtable ─────────────────────────────────────────────────
async function fetchRules() {
  const { token, baseId } = airtableBase();
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${RULES_TABLE}?view=Grid%20view`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records ?? []).map((record: any) => {
    const f = record.fields;
    let trigger_config: Record<string, any> = {};
    try {
      trigger_config = JSON.parse(f["Trigger Config"] ?? "{}");
    } catch {
      /* empty */
    }
    return {
      id: record.id,
      name: f["Rule Name"] ?? "",
      status: (f["Status"] ?? "Draft").toLowerCase(),
      trigger_type: f["Trigger Type"] ?? "Inactivity",
      trigger_config,
      channel: f["Channel"] ?? "WhatsApp",
      message_template: f["Message Template"] ?? "",
      offer_code: f["Incentive Code"] || undefined,
      audience_filter: [],
      created_at: record.createdTime,
      audience_size: 0,
      sent_30d: 0,
      reply_rate: 0,
      revenue: 0,
    };
  });
}

export async function GET() {
  try {
    const { token, baseId } = airtableBase();
    void token;
    void baseId; // already validated in airtableBase()

    // Run all fetches in parallel
    const [clients, rules, recentActivity, calendarEvents] = await Promise.allSettled([
      fetchClients(),
      fetchRules(),
      readOpsLog(8),
      getEventsByRange(todayStr(), dateStr(7)),
    ]);

    const clientList = clients.status === "fulfilled" ? clients.value : [];
    const ruleList = rules.status === "fulfilled" ? rules.value : [];
    const activity = recentActivity.status === "fulfilled" ? recentActivity.value : [];
    const events = calendarEvents.status === "fulfilled" ? calendarEvents.value : [];

    // ── Metrics ──────────────────────────────────────────────────────────────
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

    // This week = Mon–Sun bracket
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sundayEnd = new Date(monday.getTime() + 7 * 86400000 - 1);

    const appointmentsThisWeek = events.filter((e) => {
      const t = new Date(e.startTime).getTime();
      return t >= monday.getTime() && t <= sundayEnd.getTime();
    }).length;

    // Last week for delta
    const lastMonday = new Date(monday.getTime() - 7 * 86400000);
    const lastSundayEnd = new Date(monday.getTime() - 1);
    const appointmentsLastWeek = events.filter((e) => {
      const t = new Date(e.startTime).getTime();
      return t >= lastMonday.getTime() && t <= lastSundayEnd.getTime();
    }).length;

    // Active rules count
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
