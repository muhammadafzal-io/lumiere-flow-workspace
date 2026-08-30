"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, TrendingUp } from "lucide-react";
import { AccessGate } from "@/components/rbac/AccessGate";

type OfferType = "CROSS_SELL" | "UPSELL";
type VerdictLabel = "good" | "mixed" | "underperforming" | "insufficient_data";

interface ServiceBreakdown {
  serviceId: string | null;
  presented: number;
  accepted: number;
  declined: number;
  noResponse: number;
}

interface OfferSummary {
  offerId: string;
  offerType: OfferType;
  offerName: string;
  presented: number;
  accepted: number;
  declined: number;
  noResponse: number;
  acceptanceRate: number;
  responseRate: number;
  revenueCaptured: number;
  discountGiven: number;
  avgDiscountPct: number | null;
  firstPresentedAt: string;
  lastPresentedAt: string;
  byService: ServiceBreakdown[];
  verdict: { label: VerdictLabel; reasons: string[] };
}

const VERDICT_LABEL: Record<VerdictLabel, string> = {
  good: "Good offer",
  mixed: "Mixed",
  underperforming: "Underperforming",
  insufficient_data: "Not enough data",
};

function verdictClass(label: VerdictLabel): string {
  switch (label) {
    case "good":
      return "bg-success/10 text-success border-success/20";
    case "mixed":
      return "bg-warning/15 text-warning-foreground border-warning/30";
    case "underperforming":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function typeClass(type: OfferType): string {
  return type === "CROSS_SELL"
    ? "bg-primary/10 text-primary border-primary/20"
    : "bg-purple-500/10 text-purple-600 border-purple-300/30";
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function OfferPerformancePage() {
  const [offers, setOffers] = useState<OfferSummary[]>([]);
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<401 | 403 | null>(null);
  const [days, setDays] = useState("90");
  const [typeFilter, setTypeFilter] = useState<"all" | OfferType>("all");
  const [selected, setSelected] = useState<OfferSummary | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccessDenied(null);
    try {
      const res = await fetch(`/api/offer-performance?days=${days}`);
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(res.status);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to load");
      setOffers(data.offers ?? []);
      setServiceNames(data.serviceNames ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load offer performance");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const visible = useMemo(
    () => offers.filter((o) => typeFilter === "all" || o.offerType === typeFilter),
    [offers, typeFilter],
  );

  const totals = useMemo(() => {
    const presented = offers.reduce((s, o) => s + o.presented, 0);
    const accepted = offers.reduce((s, o) => s + o.accepted, 0);
    const revenue = offers.reduce((s, o) => s + o.revenueCaptured, 0);
    const discount = offers.reduce((s, o) => s + o.discountGiven, 0);
    return {
      presented,
      accepted,
      acceptanceRate: presented > 0 ? accepted / presented : 0,
      revenue,
      discount,
    };
  }, [offers]);

  const serviceName = (id: string | null) => (id ? (serviceNames[id] ?? "Unknown treatment") : "—");

  if (accessDenied) {
    return (
      <div className="flex flex-col gap-4 p-6 max-w-[1400px]">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Offer Performance
        </h1>
        <AccessGate status={accessDenied} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Offer Performance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every add-on and discount presented to clients, with a verdict on whether it's actually
            working and why. Click a row for the full breakdown.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Presented" value={totals.presented.toLocaleString()} />
        <StatCard
          label="Overall acceptance"
          value={pct(totals.acceptanceRate)}
          tone={totals.acceptanceRate >= 0.2 ? "success" : undefined}
        />
        <StatCard label="Revenue captured" value={money(totals.revenue)} tone="success" />
        <StatCard label="Discount given" value={money(totals.discount)} tone="warning" />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last 12 months</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | OfferType)}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Add-ons & discounts</SelectItem>
            <SelectItem value="CROSS_SELL">Add-ons only</SelectItem>
            <SelectItem value="UPSELL">Discounts only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="text-sm text-destructive border border-destructive/20 bg-destructive/5 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Offer</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium text-right">Presented</th>
                <th className="px-3 py-2 font-medium text-right">Accepted</th>
                <th className="px-3 py-2 font-medium text-right">Acceptance</th>
                <th className="px-3 py-2 font-medium text-right">Revenue impact</th>
                <th className="px-3 py-2 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground text-sm">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground text-sm">
                    No offers presented in this range yet. Add-ons offered in chat and discounts
                    sent in the confirmation email will show up here once clients respond.
                  </td>
                </tr>
              )}
              {!loading &&
                visible.map((o) => (
                  <tr
                    key={`${o.offerType}:${o.offerId}`}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() => setSelected(o)}
                  >
                    <td className="px-3 py-2 font-medium max-w-[200px] truncate">{o.offerName}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${typeClass(o.offerType)}`}
                      >
                        {o.offerType === "CROSS_SELL" ? "Add-on" : "Discount"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.presented}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.accepted}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {pct(o.acceptanceRate)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(o.revenueCaptured)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${verdictClass(o.verdict.label)}`}
                      >
                        {VERDICT_LABEL[o.verdict.label]}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{selected?.offerName}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="flex flex-col gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${typeClass(selected.offerType)}`}
                >
                  {selected.offerType === "CROSS_SELL" ? "Add-on" : "Discount"}
                </span>
                <span
                  className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${verdictClass(selected.verdict.label)}`}
                >
                  {VERDICT_LABEL[selected.verdict.label]}
                </span>
              </div>

              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <div className="text-xs font-medium text-muted-foreground mb-1">Why</div>
                <ul className="list-disc pl-4 space-y-1">
                  {selected.verdict.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Presented</dt>
                <dd className="text-right tabular-nums">{selected.presented}</dd>
                <dt className="text-muted-foreground">Accepted</dt>
                <dd className="text-right tabular-nums">{selected.accepted}</dd>
                <dt className="text-muted-foreground">Declined</dt>
                <dd className="text-right tabular-nums">{selected.declined}</dd>
                <dt className="text-muted-foreground">No response</dt>
                <dd className="text-right tabular-nums">{selected.noResponse}</dd>
                <dt className="text-muted-foreground">Acceptance rate</dt>
                <dd className="text-right tabular-nums">{pct(selected.acceptanceRate)}</dd>
                <dt className="text-muted-foreground">Response rate</dt>
                <dd className="text-right tabular-nums">{pct(selected.responseRate)}</dd>
                <dt className="text-muted-foreground">Revenue captured</dt>
                <dd className="text-right tabular-nums">{money(selected.revenueCaptured)}</dd>
                {selected.offerType === "UPSELL" && (
                  <>
                    <dt className="text-muted-foreground">Discount given</dt>
                    <dd className="text-right tabular-nums">{money(selected.discountGiven)}</dd>
                    {selected.avgDiscountPct != null && (
                      <>
                        <dt className="text-muted-foreground">Avg. discount depth</dt>
                        <dd className="text-right tabular-nums">
                          {Math.round(selected.avgDiscountPct)}%
                        </dd>
                      </>
                    )}
                  </>
                )}
                <dt className="text-muted-foreground">First presented</dt>
                <dd className="text-right">{fmtDate(selected.firstPresentedAt)}</dd>
                <dt className="text-muted-foreground">Last presented</dt>
                <dd className="text-right">{fmtDate(selected.lastPresentedAt)}</dd>
              </dl>

              {selected.byService.length > 1 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">
                    By treatment it was offered alongside
                  </div>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                          <th className="px-2 py-1.5 font-medium">Treatment</th>
                          <th className="px-2 py-1.5 font-medium text-right">Presented</th>
                          <th className="px-2 py-1.5 font-medium text-right">Accepted</th>
                          <th className="px-2 py-1.5 font-medium text-right">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.byService.map((b) => (
                          <tr key={b.serviceId ?? "unknown"} className="border-b last:border-0">
                            <td className="px-2 py-1.5">{serviceName(b.serviceId)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{b.presented}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{b.accepted}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {pct(b.presented > 0 ? b.accepted / b.presented : 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning-foreground" : "";
  return (
    <div className="border rounded-lg px-3 py-2 bg-card">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
