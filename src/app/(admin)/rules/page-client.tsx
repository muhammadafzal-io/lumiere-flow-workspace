"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus, Zap } from "lucide-react";
import { store, useStore } from "@/lib/store";
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
  const rules = useStore((s) => s.rules);
  const [tab, setTab] = useState("active");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);

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

  const togglePause = (r: Rule) => {
    store.upsertRule({ ...r, status: r.status === "active" ? "paused" : "active" });
    toast.success(`Rule ${r.status === "active" ? "paused" : "activated"}`);
  };
  const duplicate = (r: Rule) => {
    store.upsertRule({
      ...r,
      id: `r_${Date.now()}`,
      name: `${r.name} (copy)`,
      status: "draft",
      created_at: new Date().toISOString(),
    });
    toast.success("Rule duplicated");
  };
  const remove = (r: Rule) => {
    store.deleteRule(r.id);
    toast.success("Rule deleted");
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
        <Button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Create rule
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">Active ({counts.active})</TabsTrigger>
          <TabsTrigger value="paused">Paused ({counts.paused})</TabsTrigger>
          <TabsTrigger value="draft">Drafts ({counts.draft})</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {filtered.length === 0 ? (
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
                          Reaches{" "}
                          <span className="text-foreground font-medium">{r.audience_size}</span>{" "}
                          customers
                        </span>
                        <span>
                          Channel: <span className="text-foreground font-medium">{r.channel}</span>
                        </span>
                        {r.last_run_at && <span>Last sent {timeAgo(r.last_run_at)}</span>}
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

      <RuleModal open={modalOpen} onOpenChange={setModalOpen} editing={editing} />
    </div>
  );
}
