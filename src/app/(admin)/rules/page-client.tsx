/* eslint-disable prettier/prettier */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus, Zap, RefreshCw } from "lucide-react";
import type { Rule } from "@/lib/types";
import { RuleModal } from "@/components/RuleModal";
import { toast } from "sonner";

const STATUS_COPY: Record<string, string> = { active: "Active", paused: "Paused", draft: "Draft" };

function statusBadge(s: string) {
  const map: Record<string, string> = {
    active: "bg-success/10 text-success border-success/20",
    paused: "bg-warning/15 text-warning-foreground border-warning/30",
    draft: "bg-muted text-muted-foreground border-border",
  };
  return `inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-md border ${map[s]}`;
}

function triggerDescription(r: Rule): string {
  switch (r.trigger_type) {
    case "Birthday":
      return `${r.trigger_config.days_before} days before birthday`;
    case "Inactivity":
      return `No visit in ${r.trigger_config.days} days`;
    case "Treatment-based":
      return `${r.trigger_config.days_after} days after ${r.trigger_config.treatment}`;
    case "Date-based":
      return `One-time on ${r.trigger_config.date}`;
    case "No-show recovery":
      return `${r.trigger_config.hours_after}h after missed appointment`;
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rule");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRules(data.rules ?? []);
    } catch {
      toast.error("Failed to load rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "n" &&
        !modalOpen &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        setEditing(null);
        setModalOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  const counts = {
    active: rules.filter((r) => r.status === "active").length,
    paused: rules.filter((r) => r.status === "paused").length,
    draft: rules.filter((r) => r.status === "draft").length,
  };
  const filtered = rules.filter((r) => r.status === tab);

  const togglePause = async (r: Rule) => {
    const newStatus = r.status === "active" ? "Paused" : "Active";
    try {
      const res = await fetch("/api/rule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: r.id,
          ruleName: r.name,
          status: newStatus,
          triggerType: r.trigger_type,
          triggerConfig: r.trigger_config,
          channel: r.channel,
          messageTemplate: r.message_template,
          incentiveCode: r.offer_code ?? "",
        }),
      });
      if (!res.ok) throw new Error();
      setRules((prev) =>
        prev.map((x) =>
          x.id === r.id ? { ...x, status: newStatus.toLowerCase() as Rule["status"] } : x,
        ),
      );
      toast.success(`Rule ${newStatus === "Paused" ? "paused" : "activated"}`);
    } catch {
      toast.error("Failed to update rule");
    }
  };

  const duplicate = async (r: Rule) => {
    try {
      const res = await fetch("/api/rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleName: `${r.name} (copy)`,
          status: "Draft",
          triggerType: r.trigger_type,
          triggerConfig: r.trigger_config,
          channel: r.channel,
          messageTemplate: r.message_template,
          incentiveCode: r.offer_code ?? "",
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Rule duplicated");
      void fetchRules();
    } catch {
      toast.error("Failed to duplicate rule");
    }
  };

  const remove = async (r: Rule) => {
    try {
      const res = await fetch(`/api/rule?id=${r.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRules((prev) => prev.filter((x) => x.id !== r.id));
      toast.success("Rule deleted");
    } catch {
      toast.error("Failed to delete rule");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rules</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automated messaging triggered by customer behavior. Press{" "}
            <kbd className="border rounded px-1 text-[10px]">N</kbd> to create.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchRules} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" /> Create rule
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">Active ({counts.active})</TabsTrigger>
          <TabsTrigger value="paused">Paused ({counts.paused})</TabsTrigger>
          <TabsTrigger value="draft">Drafts ({counts.draft})</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-card p-5 animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/3 mb-3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed py-16 text-center">
              <Zap className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <h3 className="mt-3 text-sm font-medium">
                No {STATUS_COPY[tab].toLowerCase()} rules
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Create your first rule to start automating customer messaging.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Create rule
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border bg-card p-5 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{r.name}</h3>
                        <span className={statusBadge(r.status)}>{STATUS_COPY[r.status]}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1.5">
                        Trigger: {triggerDescription(r)}
                        {r.offer_code ? ` · Offer ${r.offer_code}` : ""}
                      </p>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground mt-3">
                        <span>
                          Channel: <span className="text-foreground font-medium">{r.channel}</span>
                        </span>
                        {r.last_run_at && <span>Last sent {timeAgo(r.last_run_at)}</span>}
                        <span>Created {timeAgo(r.created_at)}</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(r);
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => togglePause(r)}>
                          {r.status === "active" ? "Pause" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicate(r)}>Duplicate</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => remove(r)} className="text-destructive">
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <RuleModal
        open={modalOpen}
        onOpenChange={(v) => {
          setModalOpen(v);
          if (!v) void fetchRules();
        }}
        editing={editing}
      />
    </div>
  );
}
