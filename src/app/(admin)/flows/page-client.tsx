"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cake,
  Bell,
  UserX,
  Sparkles,
  PlayCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  Search,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AudienceFilterPanel } from "@/components/retention/AudienceFilterPanel";
import type { AudienceFilters, AudienceRow, RetentionFlowKey } from "@/lib/retention/audience-config";
import { defaultFiltersForFlow } from "@/lib/retention/audience-config";
import { toast } from "sonner";

interface FlowResult {
  status: "idle" | "running" | "success" | "error";
  sent?: number;
  skipped?: number;
  failed?: number;
  error?: string;
  ranAt?: string;
}

const FLOW_META: Record<
  RetentionFlowKey,
  { label: string; description: string; icon: React.ReactNode; color: string }
> = {
  birthday: {
    label: "Birthday Credits",
    description: "$50 birthday credits for upcoming birthdays",
    icon: <Cake className="h-4 w-4" />,
    color: "text-pink-500",
  },
  reminders: {
    label: "Appointment Reminders",
    description: "T-72h, T-24h, T-2h reminders for upcoming appointments",
    icon: <Bell className="h-4 w-4" />,
    color: "text-blue-500",
  },
  noshow: {
    label: "No-show Recovery",
    description: "Rebook messages for clients who no-showed",
    icon: <UserX className="h-4 w-4" />,
    color: "text-orange-500",
  },
  reactivation: {
    label: "Client Reactivation",
    description: "AI-personalized win-back for dormant clients",
    icon: <Sparkles className="h-4 w-4" />,
    color: "text-purple-500",
  },
};

function filtersToParams(flow: RetentionFlowKey, filters: AudienceFilters): URLSearchParams {
  const p = new URLSearchParams({ flow });
  if (filters.q) p.set("q", filters.q);
  filters.status?.forEach((s) => p.append("status", s));
  filters.treatment?.forEach((t) => p.append("treatment", t));
  if (filters.visit_min != null) p.set("visit_min", String(filters.visit_min));
  if (filters.visit_max != null) p.set("visit_max", String(filters.visit_max));
  if (filters.last_visit && filters.last_visit !== "any") p.set("last_visit", filters.last_visit);
  if (filters.has_email === true) p.set("has_email", "yes");
  if (filters.has_email === false) p.set("has_email", "no");
  if (filters.has_contact === true) p.set("has_contact", "yes");
  if (filters.has_contact === false) p.set("has_contact", "no");
  if (filters.birthday_days_ahead != null)
    p.set("birthday_days_ahead", String(filters.birthday_days_ahead));
  if (filters.credit_not_sent) p.set("credit_not_sent", "yes");
  else if (flow === "birthday") p.set("credit_not_sent", "any");
  if (filters.dormant_days != null) p.set("dormant_days", String(filters.dormant_days));
  filters.reactivation_step?.forEach((s) => p.append("reactivation_step", String(s)));
  if (filters.noshow_date) p.set("noshow_date", filters.noshow_date);
  if (filters.reminder_window && filters.reminder_window !== "any")
    p.set("reminder_window", filters.reminder_window);
  return p;
}

export default function FlowsClient() {
  const [flow, setFlow] = useState<RetentionFlowKey>("birthday");
  const [filters, setFilters] = useState<AudienceFilters>(() => defaultFiltersForFlow("birthday"));
  const [rows, setRows] = useState<AudienceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [eligible, setEligible] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<FlowResult>({ status: "idle" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const meta = FLOW_META[flow];

  const loadAudience = useCallback(async () => {
    setLoading(true);
    try {
      const merged = { ...filters, q: search || filters.q };
      const params = filtersToParams(flow, merged);
      const res = await fetch(`/api/retention/audience?${params}`);
      if (!res.ok) throw new Error("Failed to load audience");
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setEligible(data.eligible ?? 0);
      setActiveCount(data.activeFilterCount ?? 0);
      setSelected(new Set());
    } catch {
      toast.error("Failed to load audience");
    } finally {
      setLoading(false);
    }
  }, [flow, filters, search]);

  useEffect(() => {
    setFilters(defaultFiltersForFlow(flow));
    setSearch("");
    setResult({ status: "idle" });
  }, [flow]);

  useEffect(() => {
    const t = setTimeout(() => void loadAudience(), 300);
    return () => clearTimeout(t);
  }, [loadAudience]);

  const runPayload = useMemo(() => {
    const ids = selected.size > 0 ? [...selected] : rows.map((r) => r.id);
    if (flow === "reminders") return { appointmentIds: ids };
    return { clientIds: ids };
  }, [flow, rows, selected]);

  async function runFlow() {
    if (eligible === 0) {
      toast.error("No eligible audience — adjust filters");
      return;
    }
    setResult({ status: "running" });
    try {
      const res = await fetch(`/api/admin/run-flow?flow=${flow}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runPayload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Run failed");
      setResult({
        status: "success",
        sent: data.sent ?? 0,
        skipped: data.skipped ?? 0,
        failed: data.failed ?? 0,
        ranAt: new Date().toLocaleTimeString(),
      });
      toast.success(`Sent ${data.sent} · skipped ${data.skipped} · failed ${data.failed}`);
      void loadAudience();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Run failed";
      setResult({ status: "error", error: msg });
      toast.error(msg);
    }
  }

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] -m-6">
      <div className="px-6 pt-2 pb-4 border-b bg-background shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Retention Flows</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Build an audience with filters, preview matches, then run the flow.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
              {showFilters ? (
                <PanelLeftClose className="h-4 w-4 mr-1.5" />
              ) : (
                <PanelLeft className="h-4 w-4 mr-1.5" />
              )}
              {showFilters ? "Hide filters" : "Show filters"}
            </Button>
            <Button onClick={runFlow} disabled={result.status === "running" || loading} className="gap-1.5">
              {result.status === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Run {meta.label}
            </Button>
          </div>
        </div>

        <Tabs value={flow} onValueChange={(v) => setFlow(v as RetentionFlowKey)} className="mt-4">
          <TabsList>
            {(Object.keys(FLOW_META) as RetentionFlowKey[]).map((key) => (
              <TabsTrigger key={key} value={key} className="gap-1.5">
                <span className={FLOW_META[key].color}>{FLOW_META[key].icon}</span>
                {FLOW_META[key].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-1 min-h-0">
        {showFilters && (
          <aside className="w-72 shrink-0 hidden md:block">
            <AudienceFilterPanel
              flow={flow}
              filters={filters}
              onChange={setFilters}
              activeCount={activeCount}
            />
          </aside>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3 bg-background">
            <div className="flex gap-4 text-sm">
              <span>
                <span className="text-muted-foreground">Total </span>
                <span className="font-semibold">{total}</span>
              </span>
              <span>
                <span className="text-muted-foreground">Eligible </span>
                <span className="font-semibold text-primary">{eligible}</span>
              </span>
              {selected.size > 0 && (
                <span>
                  <span className="text-muted-foreground">Selected </span>
                  <span className="font-semibold">{selected.size}</span>
                </span>
              )}
            </div>
            <div className="relative flex-1 min-w-[200px] max-w-sm ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email…"
                className="pl-8 h-8 text-sm"
              />
            </div>
            {result.status === "success" && (
              <Badge variant="secondary" className="text-green-700 bg-green-50">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                sent {result.sent} · skipped {result.skipped}
              </Badge>
            )}
            {result.status === "error" && (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                {result.error?.slice(0, 40)}
              </Badge>
            )}
          </div>

          <p className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/20">
            {meta.description}
            {result.ranAt && ` · Last run ${result.ranAt}`}
          </p>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && selected.size === rows.length}
                      onChange={toggleAll}
                      className="rounded border-input"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  {flow !== "reminders" && (
                    <th className="px-4 py-2.5 font-medium">Visits</th>
                  )}
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse border-b">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="h-3 bg-muted rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                      No matches — adjust filters or search.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleRow(r.id)}
                          className="rounded border-input"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-medium text-primary">{r.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.email || r.phone || "—"}</td>
                      {flow !== "reminders" && (
                        <td className="px-4 py-2.5">{r.visits ?? "—"}</td>
                      )}
                      <td className="px-4 py-2.5">{r.status ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.detail ?? r.treatment ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 border-t text-xs text-muted-foreground bg-background shrink-0">
            {selected.size > 0
              ? `Run will target ${selected.size} selected — or all ${eligible} eligible if none selected`
              : `Run will target all ${eligible} eligible recipients`}
          </div>
        </div>
      </div>
    </div>
  );
}
