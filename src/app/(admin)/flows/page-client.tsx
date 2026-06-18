"use client";

import { useState } from "react";
import {
  Cake,
  Bell,
  UserX,
  Sparkles,
  PlayCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type FlowKey = "birthday" | "reminders" | "noshow" | "reactivation" | "all";

interface FlowResult {
  status: "idle" | "running" | "success" | "error";
  sent?: number;
  skipped?: number;
  failed?: number;
  error?: string;
  raw?: object;
  expanded?: boolean;
  ranAt?: string;
}

const FLOWS: {
  key: FlowKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  endpoint: string;
}[] = [
  {
    key: "birthday",
    label: "Birthday Credits",
    description: "Send $50 birthday credits to clients with birthdays in the next 7 days",
    icon: <Cake className="h-5 w-5" />,
    color: "text-pink-500",
    endpoint: "/api/admin/run-flow?flow=birthday",
  },
  {
    key: "reminders",
    label: "Appointment Reminders",
    description: "Send T-72h, T-24h, T-2h reminders for upcoming appointments",
    icon: <Bell className="h-5 w-5" />,
    color: "text-blue-500",
    endpoint: "/api/admin/run-flow?flow=reminders",
  },
  {
    key: "noshow",
    label: "No-show Recovery",
    description: "Send rebook messages to clients who no-showed today",
    icon: <UserX className="h-5 w-5" />,
    color: "text-orange-500",
    endpoint: "/api/admin/run-flow?flow=noshow",
  },
  {
    key: "reactivation",
    label: "Client Reactivation",
    description: "Send AI-personalized messages to clients dormant for 90+ days",
    icon: <Sparkles className="h-5 w-5" />,
    color: "text-purple-500",
    endpoint: "/api/admin/run-flow?flow=reactivation",
  },
];

export default function FlowsClient() {
  const [results, setResults] = useState<Record<string, FlowResult>>({});
  const [runningAll, setRunningAll] = useState(false);

  async function runFlow(key: FlowKey, endpoint: string) {
    setResults((prev) => ({ ...prev, [key]: { status: "running" } }));

    try {
      const res = await fetch(endpoint);
      const data = (await res.json()) as {
        ok: boolean;
        sent?: number;
        skipped?: number;
        failed?: number;
        error?: string;
        results?: Record<string, { sent?: number; skipped?: number; failed?: number }>;
      };

      if (key === "all" && data.results) {
        // Flatten all-flow results
        Object.entries(data.results).forEach(([flowKey, flowResult]) => {
          setResults((prev) => ({
            ...prev,
            [flowKey]: {
              status: "success",
              sent: (flowResult as { sent?: number }).sent ?? 0,
              skipped: (flowResult as { skipped?: number }).skipped ?? 0,
              failed: (flowResult as { failed?: number }).failed ?? 0,
              raw: flowResult,
              ranAt: new Date().toLocaleTimeString(),
            },
          }));
        });
        setResults((prev) => ({
          ...prev,
          all: { status: "success", raw: data, ranAt: new Date().toLocaleTimeString() },
        }));
      } else {
        setResults((prev) => ({
          ...prev,
          [key]: {
            status: data.ok ? "success" : "error",
            sent: data.sent ?? 0,
            skipped: data.skipped ?? 0,
            failed: data.failed ?? 0,
            error: data.error,
            raw: data,
            ranAt: new Date().toLocaleTimeString(),
          },
        }));
      }
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [key]: {
          status: "error",
          error: err instanceof Error ? err.message : "Network error",
        },
      }));
    }
  }

  async function runAll() {
    setRunningAll(true);
    for (const flow of FLOWS) {
      await runFlow(flow.key, flow.endpoint);
    }
    setRunningAll(false);
  }

  function toggleExpand(key: string) {
    setResults((prev) => ({
      ...prev,
      [key]: { ...prev[key], expanded: !prev[key]?.expanded },
    }));
  }

  const result = (key: string) => results[key];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Retention Flows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manually trigger any retention flow and see live results.
          </p>
        </div>
        <Button onClick={runAll} disabled={runningAll} className="gap-2" size="lg">
          {runningAll ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Running all…
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" /> Run All Flows
            </>
          )}
        </Button>
      </div>

      {/* flow cards */}
      <div className="space-y-3">
        {FLOWS.map((flow) => {
          const r = result(flow.key);
          const isRunning = r?.status === "running";

          return (
            <div key={flow.key} className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 p-5">
                {/* icon */}
                <div className={`shrink-0 ${flow.color}`}>{flow.icon}</div>

                {/* info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{flow.label}</span>
                    {r?.status === "success" && (
                      <Badge variant="secondary" className="text-green-600 bg-green-50">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        sent {r.sent} · skipped {r.skipped} · failed {r.failed}
                      </Badge>
                    )}
                    {r?.status === "error" && (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        {r.error?.slice(0, 40)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{flow.description}</p>
                  {r?.ranAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">Last run: {r.ranAt}</p>
                  )}
                </div>

                {/* actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {r?.raw && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleExpand(flow.key)}
                    >
                      {r.expanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isRunning || runningAll}
                    onClick={() => runFlow(flow.key, flow.endpoint)}
                    className="gap-1.5"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-3.5 w-3.5" /> Run
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* expanded JSON */}
              {r?.expanded && r.raw && (
                <div className="border-t bg-muted/40 px-5 py-4">
                  <pre className="text-xs overflow-auto max-h-64 whitespace-pre-wrap break-all">
                    {JSON.stringify(r.raw, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Flows run against live Supabase data. Results are logged to the Activity Log.
      </p>
    </div>
  );
}
