"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { OpsLogEntry } from "@/types";

type LogRow = OpsLogEntry & { id: string };

const EVENT_TYPES = [
  "booking",
  "escalation",
  "inquiry",
  "no-show",
  "noshow-recovery",
  "reminder",
  "reactivation",
  "birthday",
  "campaign",
] as const;

function statusPill(s: string) {
  const map: Record<string, string> = {
    success: "bg-success/10 text-success border-success/20",
    pending: "bg-warning/15 text-warning-foreground border-warning/30",
    failed: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return `inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${map[s] ?? "bg-muted text-muted-foreground border-border"}`;
}

function eventBadge(t: string) {
  const map: Record<string, string> = {
    booking: "bg-primary/10 text-primary border-primary/20",
    escalation: "bg-destructive/10 text-destructive border-destructive/20",
    inquiry: "bg-muted text-muted-foreground border-border",
    "no-show": "bg-warning/15 text-warning-foreground border-warning/30",
    "noshow-recovery": "bg-orange-500/10 text-orange-600 border-orange-300/30",
    reminder: "bg-info/10 text-info border-info/20",
    reactivation: "bg-purple-500/10 text-purple-600 border-purple-300/30",
    birthday: "bg-pink-500/10 text-pink-600 border-pink-300/30",
    campaign: "bg-amber-500/10 text-amber-700 border-amber-300/30",
  };
  return `inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border capitalize ${map[t] ?? "bg-muted text-muted-foreground border-border"}`;
}

function fmtTimestamp(raw: string): string {
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return d.toLocaleString("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return raw.slice(0, 20);
}

function platformBadge(p: string) {
  const map: Record<string, string> = {
    calendar: "bg-emerald-500/10 text-emerald-700 border-emerald-300/30",
    widget: "bg-blue-500/10 text-blue-700 border-blue-300/30",
    telegram: "bg-sky-500/10 text-sky-700 border-sky-300/30",
    discord: "bg-indigo-500/10 text-indigo-700 border-indigo-300/30",
    system: "bg-muted text-muted-foreground border-border",
  };
  return `inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border capitalize ${map[p.toLowerCase()] ?? map.system}`;
}

export default function ActivityPage() {
  const [entries, setEntries] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [eventType, setEventType] = useState("all");
  const [status, setStatus] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<LogRow | null>(null);

  const fetchEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/activity?limit=500");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  // Derive unique platforms from loaded data for the filter dropdown
  const platforms = useMemo(
    () => Array.from(new Set(entries.map((e) => e.platform).filter(Boolean))).sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (eventType !== "all" && e.eventType !== eventType) return false;
      if (status !== "all" && e.status !== status) return false;
      if (platform !== "all" && e.platform.toLowerCase() !== platform.toLowerCase()) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !e.clientName.toLowerCase().includes(q) &&
          !e.details.toLowerCase().includes(q) &&
          !(e.phone ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [entries, eventType, status, platform, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every automated message and event from the operations log.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchEntries}
          disabled={loading}
          className="h-8"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center rounded-lg border bg-card p-3">
        <Input
          placeholder="Search client, details…"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          className="h-9 w-[200px]"
        />
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="w-[170px] h-9">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All event types</SelectItem>
            {EVENT_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="capitalize">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p} value={p} className="capitalize">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {entries.length} entries
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div className="rounded-lg border bg-destructive/5 p-6 text-center text-sm text-destructive">
          {error} —{" "}
          <button className="underline" onClick={fetchEntries}>
            retry
          </button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">Timestamp</th>
                  <th className="text-left font-medium px-4 py-2.5">Client</th>
                  <th className="text-left font-medium px-4 py-2.5">Event type</th>
                  <th className="text-left font-medium px-4 py-2.5">Platform</th>
                  <th className="text-left font-medium px-4 py-2.5">Details</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                  <th className="text-right font-medium px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && entries.length === 0 ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 rounded bg-muted w-full max-w-[120px]" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-muted-foreground text-xs"
                    >
                      No entries match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                        {fmtTimestamp(a.timestamp)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{a.clientName || "—"}</div>
                        {(a.phone || a.email) && (
                          <div className="text-xs text-muted-foreground">{a.phone || a.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={eventBadge(a.eventType)}>{a.eventType}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={platformBadge(a.platform)}>{a.platform || "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[280px] truncate text-xs">
                        {a.details.slice(0, 70)}
                        {a.details.length > 70 ? "…" : ""}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={statusPill(a.status)}>{a.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setOpen(a)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail modal */}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Event detail</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-4">
              <div className="text-sm grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Client</div>
                  <div className="font-medium">{open.clientName || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Event type</div>
                  <span className={eventBadge(open.eventType)}>{open.eventType}</span>
                </div>
                {open.phone && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Phone</div>
                    <div>{open.phone}</div>
                  </div>
                )}
                {open.email && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Email</div>
                    <div>{open.email}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Platform</div>
                  <div className="capitalize">{open.platform || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Timestamp</div>
                  <div>{open.timestamp}</div>
                </div>
                {open.clientId && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Client ID</div>
                    <div className="text-xs font-mono text-muted-foreground">{open.clientId}</div>
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">Details</div>
                <div className="rounded-lg border bg-secondary/40 p-4 text-sm whitespace-pre-wrap">
                  {open.details || "—"}
                </div>
              </div>
              <div>
                <span className={statusPill(open.status)}>{open.status}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
