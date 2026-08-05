"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { Rule } from "@/lib/types";
import type { RuleAudienceFilters, RuleAudienceRow } from "@/lib/rules/audience-config";
import { defaultRuleAudienceFilters } from "@/lib/rules/audience-config";
import { formatLastVisit } from "@/lib/customers/last-visit";
import { RuleAudienceFilterPanel } from "@/components/rules/RuleAudienceFilterPanel";
import { RuleSchedulePanel } from "@/components/rules/RuleSchedulePanel";
import { RuleOfferPanel } from "@/components/rules/RuleOfferPanel";
import { parseRuleSchedule, scheduleSummary } from "@/lib/rules/schedule-config";
import { RuleModal } from "@/components/RuleModal";
import { treatmentTriggerLabel } from "@/lib/rules/audience-match";
import { formatOfferSummaryFromRule } from "@/lib/rules/offer-config";
import { AccessGate } from "@/components/rbac/AccessGate";
import { toast } from "sonner";

function filtersToParams(f: RuleAudienceFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  f.status?.forEach((s) => p.append("status", s));
  f.treatment?.forEach((t) => p.append("treatment", t));
  if (f.visit_min != null) p.set("visit_min", String(f.visit_min));
  if (f.visit_max != null) p.set("visit_max", String(f.visit_max));
  if (f.last_visit && f.last_visit !== "any") p.set("last_visit", f.last_visit);
  p.set("has_email", f.has_email === false ? "no" : "yes");
  return p;
}

function triggerSummary(rule: Rule): string {
  const cfg = rule.trigger_config ?? {};
  switch (rule.trigger_type) {
    case "Visit count":
      return `${cfg.min_visits ?? cfg.visit_count ?? "?"}+ visits`;
    case "Inactivity":
      return `No visit in ${cfg.days ?? 90} days`;
    case "Birthday":
      return `${cfg.days_before ?? 7} days before birthday`;
    case "Custom":
      return "Custom filters";
    default:
      return rule.trigger_type;
  }
}

export default function RuleAudiencePage() {
  const params = useParams();
  const id = params.id as string;

  const [rule, setRule] = useState<Rule | null>(null);
  const [rows, setRows] = useState<RuleAudienceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [eligible, setEligible] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [filters, setFilters] = useState<RuleAudienceFilters>(defaultRuleAudienceFilters());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState<401 | 403 | null>(null);
  const [sending, setSending] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiParsing, setAiParsing] = useState(false);
  const [aiExplanation, setAiExplanation] = useState("");
  const seededFiltersRef = useRef(false);

  const ruleMinVisits =
    rule?.trigger_type === "Visit count"
      ? (rule.trigger_config.min_visits ?? rule.trigger_config.visit_count)
      : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    setAccessDenied(null);
    try {
      const merged = { ...filters, q: search || filters.q };
      const res = await fetch(`/api/rule/${id}/audience?${filtersToParams(merged)}`);
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(res.status);
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setRule(data.rule);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setEligible(data.eligible ?? 0);
      setActiveCount(data.activeFilterCount ?? 0);
      setSelected(new Set());
      setSkipped(new Set());
    } catch {
      toast.error("Failed to load rule audience");
    } finally {
      setLoading(false);
    }
  }, [id, filters, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  // Seed the filter panel from the rule's own saved audience_filters (e.g. the "Botox"
  // prerequisite on a two-treatment AI-parsed rule) the first time it loads — otherwise the
  // panel always starts blank and that prerequisite silently never takes effect unless an
  // admin manually re-adds it as a filter chip every time they open the rule.
  useEffect(() => {
    if (!rule || seededFiltersRef.current) return;
    seededFiltersRef.current = true;
    const saved = rule.trigger_config?.audience_filters as RuleAudienceFilters | undefined;
    if (saved?.treatment?.length || saved?.status?.length) {
      setFilters((prev) => ({
        ...prev,
        ...(saved.treatment?.length ? { treatment: saved.treatment } : {}),
        ...(saved.status?.length ? { status: saved.status } : {}),
      }));
    }
  }, [rule]);

  const visibleRows = useMemo(() => rows.filter((r) => !skipped.has(r.id)), [rows, skipped]);

  const sendTargets = useMemo(() => {
    const pool = visibleRows;
    if (selected.size > 0) return pool.filter((r) => selected.has(r.id));
    return pool;
  }, [visibleRows, selected]);

  const toggleRow = (rowId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const skipRow = (rowId: string) => {
    setSkipped((prev) => new Set(prev).add(rowId));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(rowId);
      return next;
    });
  };

  const restoreSkipped = (rowId: string) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      next.delete(rowId);
      return next;
    });
  };

  const runAiAudienceQuery = async () => {
    if (!aiQuery.trim()) return;
    setAiParsing(true);
    try {
      const res = await fetch("/api/rule/audience-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiQuery, ruleId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI query failed");
      setFilters((prev) => ({ ...prev, ...data.filters }));
      setAiExplanation(data.explanation ?? "");
      toast.success("AI applied audience filters");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI query failed");
    } finally {
      setAiParsing(false);
    }
  };

  const sendEmails = async () => {
    if (sendTargets.length === 0) {
      toast.error("No clients selected to send");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/rule/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIds: sendTargets.map((r) => r.id),
          recipients: sendTargets.map((r) => ({
            id: r.id,
            name: r.name,
            email: r.email,
            phone: r.phone,
            treatment: r.treatment,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      toast.success(`Sent ${data.sent} · skipped ${data.skipped} · failed ${data.failed}`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  if (loading && !rule) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/rules">
            <ArrowLeft className="h-4 w-4 mr-1" /> Rules & Campaigns
          </Link>
        </Button>
        <AccessGate status={accessDenied} />
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Rule not found</p>
        <Button variant="link" asChild>
          <Link href="/rules">Back to rules</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-7rem)] -m-6">
      <div className="px-6 pt-2 pb-3 border-b shrink-0">
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/rules">
            <ArrowLeft className="h-4 w-4 mr-1" /> Rules & Campaigns
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{rule.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {rule.trigger_type === "Treatment-based"
                ? treatmentTriggerLabel(rule.trigger_config ?? {})
                : triggerSummary(rule)}
              {formatOfferSummaryFromRule(rule) ? ` · ${formatOfferSummaryFromRule(rule)}` : ""}
            </p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge variant="outline">{rule.status}</Badge>
              <Badge variant="secondary">{rule.trigger_type}</Badge>
              {parseRuleSchedule(rule.trigger_config?.schedule).enabled && (
                <Badge variant="default" className="text-[10px]">
                  Auto-send: {scheduleSummary(parseRuleSchedule(rule.trigger_config?.schedule))}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Edit rule
            </Button>
            <Button variant="outline" size="icon" onClick={load}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              onClick={sendEmails}
              disabled={sending || sendTargets.length === 0}
              className="gap-1.5"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Send to {sendTargets.length}
            </Button>
          </div>
        </div>
        <div className="px-6 pb-4 border-b">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <RuleOfferPanel rule={rule} filters={filters} onSaved={load} />
            <RuleSchedulePanel rule={rule} filters={filters} onSaved={load} />
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-[360px] relative">
        {showFilters && (
          <aside className="w-72 shrink-0 border-r md:border-r-0 md:block absolute md:relative z-20 md:z-auto inset-y-0 left-0 bg-card md:bg-transparent shadow-lg md:shadow-none">
            <RuleAudienceFilterPanel
              filters={filters}
              onChange={setFilters}
              activeCount={activeCount}
              ruleMinVisits={ruleMinVisits as number | undefined}
            />
          </aside>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b bg-accent/20 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Sparkles className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary" />
                <Input
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  placeholder='Ask AI: "VIP clients with 10+ visits dormant 90 days"'
                  className="pl-8 h-9 text-sm bg-background"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runAiAudienceQuery();
                  }}
                />
              </div>
              <Button
                size="sm"
                onClick={runAiAudienceQuery}
                disabled={aiParsing || !aiQuery.trim()}
                className="gap-1.5"
              >
                {aiParsing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                AI filter
              </Button>
            </div>
            {aiExplanation && <p className="text-xs text-muted-foreground">{aiExplanation}</p>}
          </div>

          <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="md:hidden"
              onClick={() => setShowFilters((v) => !v)}
            >
              {showFilters ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </Button>
            <span className="text-sm">
              Total <strong>{total}</strong> · Eligible{" "}
              <strong className="text-primary">{eligible}</strong>
              {skipped.size > 0 && (
                <>
                  {" "}
                  · Skipped <strong>{skipped.size}</strong>
                </>
              )}
            </span>
            <div className="relative flex-1 min-w-[180px] max-w-sm ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients…"
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto min-h-[240px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="px-4 py-2.5 w-10">Send</th>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Visits</th>
                  <th className="px-4 py-2.5 font-medium">Last visit</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Detail</th>
                  <th className="px-4 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse border-b">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="h-3 bg-muted rounded" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">
                      <p>No clients match this rule — adjust filters or edit the rule criteria.</p>
                      {rule.trigger_type === "Treatment-based" && (
                        <p className="text-xs mt-2 max-w-md mx-auto">
                          For &quot;last 7 days&quot;, use{" "}
                          <strong>Had treatment within last X days</strong> (X = 7) when editing the
                          rule. If clients have no email, set <strong>Has email</strong> to Any in
                          the filters sidebar.
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const isSkipped = skipped.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        className={`border-b ${isSkipped ? "opacity-40 bg-muted/30" : "hover:bg-muted/30"}`}
                      >
                        <td className="px-4 py-2.5">
                          {!isSkipped && (
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggleRow(r.id)}
                              className="rounded border-input"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-medium">{r.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.email || "—"}</td>
                        <td className="px-4 py-2.5">{r.visits ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {formatLastVisit(r.lastVisit)}
                        </td>
                        <td className="px-4 py-2.5">{r.status ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {r.detail ?? "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          {isSkipped ? (
                            <button
                              type="button"
                              className="text-xs text-primary hover:underline"
                              onClick={() => restoreSkipped(r.id)}
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => skipRow(r.id)}
                            >
                              Skip
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 border-t text-xs text-muted-foreground shrink-0">
            {selected.size > 0
              ? `Sending to ${selected.size} selected (skipped ${skipped.size} excluded from list)`
              : `Sending to all ${sendTargets.length} visible clients — select rows or skip individuals`}
          </div>
        </div>
      </div>

      <RuleModal
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={rule}
        onSaved={(updated) => {
          setRule(updated);
          void load();
        }}
      />
    </div>
  );
}
