"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Mail } from "lucide-react";
import { AccessGate } from "@/components/rbac/AccessGate";
import { useCurrentUser } from "@/lib/current-user-context";
import type { EmailSendLogEntry, EmailSendCategory } from "@/lib/integrations/email-send-log-types";

const CATEGORIES = [
  "rule",
  "campaign",
  "reminder",
  "birthday",
  "noshow",
  "reactivation",
  "booking",
  "cancellation",
  "reschedule",
  "followup",
  "general",
] as const;

function fmtTime(raw: string, timeZone: string) {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function statusClass(status: string) {
  if (status === "sent") return "bg-success/10 text-success border-success/20";
  if (status === "failed") return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-warning/15 text-warning-foreground border-warning/30";
}

function categoryClass(category: string) {
  const map: Record<string, string> = {
    rule: "bg-primary/10 text-primary border-primary/20",
    campaign: "bg-amber-500/10 text-amber-700 border-amber-300/30",
    reminder: "bg-info/10 text-info border-info/20",
    birthday: "bg-pink-500/10 text-pink-600 border-pink-300/30",
    noshow: "bg-orange-500/10 text-orange-600 border-orange-300/30",
    reactivation: "bg-purple-500/10 text-purple-600 border-purple-300/30",
    booking: "bg-emerald-500/10 text-emerald-700 border-emerald-300/30",
    cancellation: "bg-destructive/10 text-destructive border-destructive/20",
    reschedule: "bg-blue-500/10 text-blue-700 border-blue-300/30",
    followup: "bg-teal-500/10 text-teal-700 border-teal-300/30",
  };
  return `inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border capitalize ${map[category] ?? "bg-muted text-muted-foreground border-border"}`;
}

export default function EmailLogsPage() {
  const { timezone } = useCurrentUser();
  const tz = timezone ?? "America/Chicago";
  const searchParams = useSearchParams();
  const initialCategories = useMemo(() => {
    const raw = searchParams.get("categories");
    if (!raw) return null;
    return raw.split(",").filter(Boolean) as EmailSendCategory[];
  }, [searchParams]);

  const [entries, setEntries] = useState<EmailSendLogEntry[]>([]);
  const [stats, setStats] = useState({ sent: 0, failed: 0, skipped: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<401 | 403 | null>(null);

  const [category, setCategory] = useState(() => searchParams.get("category") ?? "all");
  const [categories, setCategories] = useState<EmailSendCategory[] | null>(initialCategories);
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "all");
  const [trigger, setTrigger] = useState(() => searchParams.get("trigger") ?? "all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EmailSendLogEntry | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccessDenied(null);
    try {
      const qs = new URLSearchParams();
      if (categories?.length) {
        qs.set("categories", categories.join(","));
      } else if (category !== "all") {
        qs.set("category", category);
      }
      if (status !== "all") qs.set("status", status);
      if (trigger !== "all") qs.set("trigger", trigger);
      if (search.trim()) qs.set("search", search.trim());

      const res = await fetch(`/api/email-logs?${qs.toString()}`);
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(res.status);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEntries(data.entries ?? []);
      setStats(data.stats ?? { sent: 0, failed: 0, skipped: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load email logs");
    } finally {
      setLoading(false);
    }
  }, [category, categories, status, trigger, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const total = useMemo(() => stats.sent + stats.failed + stats.skipped, [stats]);

  if (accessDenied) {
    return (
      <div className="flex flex-col gap-4 p-6 max-w-[1400px]">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Send Log
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
            <Mail className="h-5 w-5" />
            Email Send Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All email attempts from cron jobs, manual sends, and system triggers.
            {categories?.length ? (
              <span className="block mt-0.5">
                Filtered: {categories.join(", ")} —{" "}
                <Link
                  href="/email-logs"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  show all
                </Link>
              </span>
            ) : null}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total loaded" value={total} />
        <StatCard label="Sent" value={stats.sent} tone="success" />
        <StatCard label="Failed" value={stats.failed} tone="destructive" />
        <StatCard label="Skipped" value={stats.skipped} tone="warning" />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search email, client, subject…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
        <Select
          value={categories?.length ? "rules-campaigns" : category}
          onValueChange={(v) => {
            if (v === "rules-campaigns") {
              setCategories(["rule", "campaign"]);
              setCategory("all");
            } else {
              setCategories(null);
              setCategory(v);
            }
          }}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="rules-campaigns">Rules & campaigns</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>
        <Select value={trigger} onValueChange={setTrigger}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue placeholder="Trigger" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All triggers</SelectItem>
            <SelectItem value="cron">Cron</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="text-sm text-destructive border border-destructive/20 bg-destructive/5 rounded-md px-3 py-2">
          {error}
          {error.includes("migration") && (
            <span className="block mt-1 text-xs">
              Run <code className="bg-muted px-1 rounded">migrations/create_email_sends.sql</code>{" "}
              in Supabase.
            </span>
          )}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Trigger</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">To</th>
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Fail reason</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground text-sm">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground text-sm">
                    No email logs yet. Sends from rules, campaigns, and retention flows will appear
                    here.
                  </td>
                </tr>
              )}
              {!loading &&
                entries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() => setSelected(e)}
                  >
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {fmtTime(e.createdAt, tz)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={categoryClass(e.category)}>{e.category}</span>
                    </td>
                    <td className="px-3 py-2 text-xs capitalize">{e.triggerType}</td>
                    <td className="px-3 py-2 text-xs max-w-[120px] truncate">
                      {e.clientName ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs max-w-[160px] truncate">{e.toEmail || "—"}</td>
                    <td className="px-3 py-2 text-xs max-w-[180px] truncate">{e.subject ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border capitalize ${statusClass(e.status)}`}
                      >
                        {e.simulated ? "skipped (demo)" : e.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-destructive max-w-[200px] truncate">
                      {e.failReason ?? "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Email send detail</DialogTitle>
          </DialogHeader>
          {selected && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Time</dt>
              <dd>{fmtTime(selected.createdAt, tz)}</dd>
              <dt className="text-muted-foreground">Category</dt>
              <dd className="capitalize">{selected.category}</dd>
              <dt className="text-muted-foreground">Trigger</dt>
              <dd className="capitalize">{selected.triggerType}</dd>
              <dt className="text-muted-foreground">Source</dt>
              <dd>{selected.sourceName ?? selected.sourceId ?? "—"}</dd>
              <dt className="text-muted-foreground">Client</dt>
              <dd>{selected.clientName ?? "—"}</dd>
              <dt className="text-muted-foreground">To</dt>
              <dd>{selected.toEmail || "—"}</dd>
              <dt className="text-muted-foreground">Subject</dt>
              <dd>{selected.subject ?? "—"}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="capitalize">{selected.status}</dd>
              <dt className="text-muted-foreground">Provider</dt>
              <dd>{selected.provider ?? "—"}</dd>
              {selected.failReason && (
                <>
                  <dt className="text-muted-foreground">Fail reason</dt>
                  <dd className="text-destructive">{selected.failReason}</dd>
                </>
              )}
              {selected.messagePreview && (
                <>
                  <dt className="text-muted-foreground">Preview</dt>
                  <dd className="text-xs whitespace-pre-wrap">{selected.messagePreview}</dd>
                </>
              )}
            </dl>
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
  value: number;
  tone?: "success" | "destructive" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "warning"
          ? "text-warning-foreground"
          : "";
  return (
    <div className="border rounded-lg px-3 py-2 bg-card">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
