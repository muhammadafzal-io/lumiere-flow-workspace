"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Zap,
  MessageSquare,
  DollarSign,
  Calendar as CalendarIcon,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientChannelsDashboard } from "@/components/ClientChannelsPanel";
import type { CalendarEvent } from "@/types";
import type { OpsLogEntry, EventType } from "@/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Chicago",
  });
}

function fmtWeekday(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function eventsOnDay(events: CalendarEvent[], day: Date) {
  return events.filter((e) => {
    const d = new Date(e.startTime);
    return sameDay(d, day);
  });
}

// ── Event type badge colours ──────────────────────────────────────────────────
function eventTypeBadge(type: EventType | string) {
  const map: Record<string, string> = {
    booking: "bg-primary/10 text-primary border-primary/20",
    reminder: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    escalation: "bg-destructive/10 text-destructive border-destructive/20",
    birthday: "bg-pink-500/10 text-pink-600 border-pink-500/20",
    "noshow-recovery": "bg-orange-500/10 text-orange-600 border-orange-500/20",
    reactivation: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    inquiry: "bg-muted text-muted-foreground border-border",
    "no-show": "bg-destructive/10 text-destructive border-destructive/20",
  };
  return `inline-flex px-2 py-0.5 text-[10px] font-medium rounded-md border ${map[type] ?? map["inquiry"]}`;
}

function statusDot(s: string) {
  const color =
    s === "success" ? "bg-success" : s === "failed" ? "bg-destructive" : "bg-muted-foreground/40";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${color}`} />;
}

// ── Trigger description ───────────────────────────────────────────────────────
function triggerDescription(rule: any): string {
  const cfg = rule.trigger_config ?? {};
  switch (rule.trigger_type) {
    case "Birthday":
      return `${cfg.days_before ?? "?"} days before birthday`;
    case "Inactivity":
      return `No visit in ${cfg.days ?? "?"} days`;
    case "Treatment-based":
      return `${cfg.days_after ?? "?"} days after ${cfg.treatment ?? "treatment"}`;
    case "Date-based":
      return `One-time on ${cfg.date ?? "?"}`;
    case "No-show recovery":
      return `${cfg.hours_after ?? "?"}h after missed appointment`;
    default:
      return rule.trigger_type;
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function KpiSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-5 animate-pulse">
      <div className="h-3 w-24 bg-muted rounded mb-4" />
      <div className="h-7 w-16 bg-muted rounded" />
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashboardData {
  metrics: {
    totalCustomers: number;
    activeCustomers: number;
    activeRulesCount: number;
    messagesSentThisMonth: number;
    appointmentsThisWeek: number;
    appointmentsLastWeek: number;
  };
  recentActivity: (OpsLogEntry & { id: string })[];
  rules: any[];
  calendarEvents: CalendarEvent[];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
    const id = setInterval(fetchDashboard, 60_000);
    return () => clearInterval(id);
  }, [fetchDashboard]);

  const m = data?.metrics;
  const activeRules = (data?.rules ?? []).filter((r: any) => r.status === "active");
  const events = data?.calendarEvents ?? [];
  const activity = data?.recentActivity ?? [];

  const weekDelta =
    m && m.appointmentsLastWeek > 0
      ? Math.round(
          ((m.appointmentsThisWeek - m.appointmentsLastWeek) / m.appointmentsLastWeek) * 100,
        )
      : m?.appointmentsThisWeek
        ? 100
        : 0;

  const kpis = [
    {
      label: "Total customers",
      value: m?.totalCustomers ?? "—",
      icon: Users,
    },
    {
      label: "Active rules",
      value: m?.activeRulesCount ?? "—",
      icon: Zap,
    },
    {
      label: "Messages this month",
      value: m?.messagesSentThisMonth?.toLocaleString() ?? "—",
      icon: MessageSquare,
    },
    {
      label: "Revenue from automation",
      value: "$0",
      icon: DollarSign,
      delta: "Not tracked yet",
      positive: true,
    },
    {
      label: "Appointments this week",
      value: m?.appointmentsThisWeek ?? "—",
      icon: CalendarIcon,
      delta: m ? `${weekDelta >= 0 ? "+" : ""}${weekDelta}% vs last week` : undefined,
      positive: weekDelta >= 0,
    },
  ];

  // Next 7 days
  const today = new Date();
  const next7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            An overview of your automated customer communications.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={fetchDashboard} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load dashboard data.{" "}
          <button onClick={fetchDashboard} className="underline">
            Retry
          </button>
        </div>
      )}

      <ClientChannelsDashboard />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <KpiSkeleton key={i} />)
          : kpis.map((k) => (
              <div key={k.label} className="rounded-lg border bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">{k.label}</span>
                  <k.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight">{k.value}</div>
                {k.delta && (
                  <div
                    className={`text-xs mt-1 flex items-center gap-1 ${k.positive ? "text-success" : "text-destructive"}`}
                  >
                    {k.positive ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {k.delta}
                  </div>
                )}
              </div>
            ))}
      </div>

      {/* Recent activity */}
      <div className="rounded-lg border bg-card">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          <Link href="/activity" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="divide-y">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-5 py-3 flex gap-3 animate-pulse">
                <div className="h-2 w-2 rounded-full bg-muted mt-1.5 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted rounded w-1/3" />
                  <div className="h-2.5 bg-muted rounded w-1/2" />
                </div>
                <div className="h-2.5 bg-muted rounded w-16" />
              </div>
            ))
          ) : activity.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No recent activity.
            </div>
          ) : (
            activity.map((a) => (
              <div key={a.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                {statusDot(a.status)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{a.clientName || "Customer"}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <span className={eventTypeBadge(a.eventType)}>{a.eventType}</span>
                    <span>· {a.platform}</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(a.timestamp).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Next 7 days mini calendar */}
      <div className="rounded-lg border bg-card">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold">Next 7 days</h2>
          <Link
            href="/calendar"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            View full calendar <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-7 divide-x">
          {next7.map((day) => {
            const isToday = sameDay(day, new Date());
            const items = loading
              ? []
              : eventsOnDay(events, day).sort((a, b) => a.startTime.localeCompare(b.startTime));
            return (
              <div
                key={day.toISOString()}
                className={`p-3 min-h-[180px] flex flex-col ${isToday ? "bg-primary/5" : ""}`}
              >
                <div>
                  <div
                    className={`text-[10px] font-semibold uppercase tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {fmtWeekday(day)}
                  </div>
                  <div className={`text-base font-semibold ${isToday ? "text-primary" : ""}`}>
                    {day.getDate()}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 mb-2">
                  {loading ? (
                    <span className="inline-block h-2 w-16 bg-muted rounded animate-pulse" />
                  ) : items.length === 0 ? (
                    "No appointments"
                  ) : (
                    `${items.length} appt${items.length > 1 ? "s" : ""}`
                  )}
                </div>
                <div className="space-y-1.5 flex-1">
                  {items.slice(0, 3).map((e) => (
                    <Link
                      key={e.id}
                      href="/calendar"
                      className="block w-full text-left rounded-md border bg-card hover:border-primary/40 hover:shadow-sm transition-all px-2 py-1.5"
                      style={{ borderLeftColor: "#6366f1", borderLeftWidth: 2.5 }}
                    >
                      <div className="text-[10px] font-semibold text-foreground">
                        {fmtTime(e.startTime)}
                      </div>
                      <div className="text-[11px] truncate">
                        {e.clientName.split(" ")[0] || "Client"}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {e.treatment}
                      </div>
                    </Link>
                  ))}
                  {items.length > 3 && (
                    <Link
                      href="/calendar"
                      className="block text-[10px] text-primary hover:underline"
                    >
                      +{items.length - 3} more
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rules performance */}
      <div className="rounded-lg border bg-card">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold">Rules performance</h2>
          <Link href="/rules" className="text-xs text-primary hover:underline">
            Manage rules
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Rule</th>
                <th className="text-left font-medium px-5 py-2.5">Trigger</th>
                <th className="text-left font-medium px-5 py-2.5">Channel</th>
                <th className="text-right font-medium px-5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-3">
                      <div className="h-3 bg-muted rounded w-32" />
                    </td>
                    <td className="px-5 py-3">
                      <div className="h-3 bg-muted rounded w-28" />
                    </td>
                    <td className="px-5 py-3">
                      <div className="h-3 bg-muted rounded w-16" />
                    </td>
                    <td className="px-5 py-3">
                      <div className="h-3 bg-muted rounded w-12 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : activeRules.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No active rules yet.{" "}
                    <Link href="/rules" className="text-primary hover:underline">
                      Create one →
                    </Link>
                  </td>
                </tr>
              ) : (
                activeRules.map((r: any) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{triggerDescription(r)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.channel}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-md border bg-success/10 text-success border-success/20">
                        Active
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
