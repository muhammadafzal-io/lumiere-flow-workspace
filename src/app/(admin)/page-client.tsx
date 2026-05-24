"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Zap,
  MessageSquare,
  DollarSign,
  Calendar as CalendarIcon,
  ArrowRight,
} from "lucide-react";
import {
  addDays,
  sameDay,
  fmtTime,
  fmtWeekday,
  appointmentsOnDate,
  practitionerById,
} from "@/lib/calendar-utils";
import {
  AppointmentSlideOver,
  RescheduleModal,
  CancelModal,
} from "@/components/calendar/AppointmentDialogs";

function StatusDot({ s }: { s: string }) {
  const color =
    s === "Replied"
      ? "bg-success"
      : s === "Opened"
        ? "bg-info"
        : s === "Failed"
          ? "bg-destructive"
          : "bg-muted-foreground/40";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />;
}

export default function Dashboard() {
  const [realMetrics, setRealMetrics] = useState<{
    totalCustomers?: number;
    messagesSentThisMonth?: number;
    appointmentsThisWeek?: number;
  } | null>(null);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const res = await fetch("/api/dashboard");
        if (res.ok) {
          const data = await res.json();
          setRealMetrics(data.metrics);


        }
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      }
    }

    // 1. Fetch immediately on mount
    fetchDashboardData();

    const intervalId = setInterval(fetchDashboardData, 30000);

    return () => clearInterval(intervalId);
  }, []);

  const customers = useStore((s) => s.customers);
  const rules = useStore((s) => s.rules);
  const activity = useStore((s) => s.activity);
  const appointments = useStore((s) => s.appointments);
  const practitioners = useStore((s) => s.practitioners);
  const activeRules = rules.filter((r) => r.status === "active");

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const today = new Date();
  const next7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const apptsThisWeek = appointments.filter((a) => {
    const d = new Date(a.start_time).getTime();
    const start = next7[0].getTime();
    const end = next7[6].getTime() + 86400000;
    return d >= start && d < end && a.status !== "cancelled";
  });
  const apptsLastWeek = appointments.filter((a) => {
    const d = new Date(a.start_time).getTime();
    const end = next7[0].getTime();
    const start = end - 7 * 86400000;
    return d >= start && d < end && a.status !== "cancelled";
  });
  const weekDelta =
    apptsLastWeek.length === 0
      ? 100
      : Math.round(((apptsThisWeek.length - apptsLastWeek.length) / apptsLastWeek.length) * 100);

  const kpis = [
    {
      label: "Total customers",
      value: realMetrics?.totalCustomers ?? (customers.length || 847),
      icon: Users,
    },
    { label: "Active rules", value: activeRules.length || 6, icon: Zap },
    {
      label: "Messages sent this month",
      value: (
        realMetrics?.messagesSentThisMonth ??
        (activity.length * 15 || 1243)
      ).toLocaleString(),
      icon: MessageSquare,
    },
    {
      label: "Revenue from automation",
      value: "$18,420",
      icon: DollarSign,
      delta: "+24% vs last month",
      positive: true,
    },
    {
      label: "Appointments this week",
      value: realMetrics?.appointmentsThisWeek ?? apptsThisWeek.length,
      icon: CalendarIcon,
      delta: `${weekDelta >= 0 ? "+" : ""}${weekDelta}% vs last week`,
      positive: weekDelta >= 0,
    },
  ];

  const recent = activity.slice(0, 8);
  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  const upcoming = activeRules.map((r) => ({
    rule: r,
    count: Math.max(1, Math.round(r.audience_size / 7)),
  }));
  const maxUp = Math.max(...upcoming.map((u) => u.count), 1);

  const [selectedAptId, setSelectedAptId] = useState<string | null>(null);
  const [reschedAptId, setReschedAptId] = useState<string | null>(null);
  const [reschedNewStart, setReschedNewStart] = useState<Date | null>(null);
  const [cancelAptId, setCancelAptId] = useState<string | null>(null);
  const selectedApt = appointments.find((a) => a.id === selectedAptId) || null;
  const reschedApt = appointments.find((a) => a.id === reschedAptId) || null;
  const cancelApt = appointments.find((a) => a.id === cancelAptId) || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          An overview of your automated customer communications.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((k) => (
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 rounded-lg border bg-card">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <Link href="/activity" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y">
            {recent.map((a) => {
              const c = customerMap.get(a.customer_id);
              const r = ruleMap.get(a.rule_id);
              return (
                <div key={a.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                  <StatusDot s={a.status} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c?.name || "Customer"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r?.name ||
                        (a.kind === "reschedule_notification"
                          ? "Reschedule notification"
                          : a.kind === "cancellation_notification"
                            ? "Cancellation notification"
                            : "Manual")}{" "}
                      · {a.channel}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(a.timestamp).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-lg border bg-card">
          <div className="px-5 py-4 border-b">
            <h2 className="text-sm font-semibold">Upcoming sends · next 7 days</h2>
          </div>
          <div className="p-5 space-y-3">
            {upcoming.map((u) => (
              <div key={u.rule.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium truncate">{u.rule.name}</span>
                  <span className="text-muted-foreground">{u.count}</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(u.count / maxUp) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

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
            const items = appointmentsOnDate(appointments, day).sort((a, b) =>
              a.start_time.localeCompare(b.start_time),
            );
            const revenue = items.reduce((s, a) => s + a.price, 0);
            return (
              <div
                key={day.toISOString()}
                className={`p-3 min-h-[180px] flex flex-col ${isToday ? "bg-primary/5" : ""}`}
              >
                <div className="flex items-baseline justify-between">
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
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 mb-2">
                  {items.length === 0
                    ? "No appointments"
                    : `${items.length} appointment${items.length === 1 ? "" : "s"}`}
                </div>
                <div className="space-y-1.5 flex-1">
                  {items.slice(0, 3).map((a) => {
                    const c = customerMap.get(a.customer_id);
                    const p = practitionerById(practitioners, a.practitioner_id);
                    return (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAptId(a.id)}
                        className="w-full text-left rounded-md border bg-card hover:border-primary/40 hover:shadow-sm transition-all px-2 py-1.5"
                        style={{ borderLeftColor: p?.color, borderLeftWidth: 2.5 }}
                      >
                        <div className="text-[10px] font-semibold text-foreground">
                          {fmtTime(new Date(a.start_time))}
                        </div>
                        <div className="text-[11px] truncate">
                          {c?.name?.split(" ")[0] || "Client"}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {a.treatment}
                        </div>
                      </button>
                    );
                  })}
                  {items.length > 3 && (
                    <Link
                      href="/calendar"
                      className="block text-[10px] text-primary hover:underline"
                    >
                      +{items.length - 3} more
                    </Link>
                  )}
                </div>
                {revenue > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-2 pt-2 border-t">
                    ${revenue.toLocaleString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="px-5 py-4 border-b">
          <h2 className="text-sm font-semibold">Rules performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-5 py-2.5">Rule</th>
              <th className="text-left font-medium px-5 py-2.5">Trigger</th>
              <th className="text-right font-medium px-5 py-2.5">Audience</th>
              <th className="text-right font-medium px-5 py-2.5">Sent (30d)</th>
              <th className="text-right font-medium px-5 py-2.5">Reply rate</th>
              <th className="text-right font-medium px-5 py-2.5">Revenue</th>
            </tr>
            </thead>
            <tbody className="divide-y">
            {activeRules.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 font-medium">{r.name}</td>
                <td className="px-5 py-3 text-muted-foreground">{r.trigger_type}</td>
                <td className="px-5 py-3 text-right">{r.audience_size}</td>
                <td className="px-5 py-3 text-right">{r.sent_30d}</td>
                <td className="px-5 py-3 text-right">{(r.reply_rate * 100).toFixed(0)}%</td>
                <td className="px-5 py-3 text-right font-medium">
                  ${r.revenue.toLocaleString()}
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      </div>

      <AppointmentSlideOver
        appointment={selectedApt}
        customer={selectedApt ? customerMap.get(selectedApt.customer_id) || null : null}
        practitioners={practitioners}
        onClose={() => setSelectedAptId(null)}
        onReschedule={(a) => {
          setSelectedAptId(null);
          setReschedAptId(a.id);
          setReschedNewStart(new Date(a.start_time));
        }}
        onCancel={(a) => {
          setSelectedAptId(null);
          setCancelAptId(a.id);
        }}
      />
      <RescheduleModal
        appointment={reschedApt}
        customer={reschedApt ? customerMap.get(reschedApt.customer_id) || null : null}
        newStart={reschedNewStart}
        onClose={() => {
          setReschedAptId(null);
          setReschedNewStart(null);
        }}
        onConfirmed={() => {
          setReschedAptId(null);
          setReschedNewStart(null);
        }}
      />
      <CancelModal
        appointment={cancelApt}
        customer={cancelApt ? customerMap.get(cancelApt.customer_id) || null : null}
        onClose={() => setCancelAptId(null)}
        onConfirmed={() => setCancelAptId(null)}
      />
    </div>
  );
}
