"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Gift, MoreHorizontal, Plus, RefreshCw, ChevronRight } from "lucide-react";
import type { Campaign, CampaignStats } from "@/lib/types";
import { CampaignModal } from "@/components/CampaignModal";
import { formatRewardLabel } from "@/lib/campaigns/db";
import { AccessGate } from "@/components/rbac/AccessGate";
import { toast } from "sonner";

type CampaignWithStats = Campaign & { stats?: CampaignStats };

const STATUS_COPY: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  draft: "Draft",
  expired: "Expired",
};

function statusBadge(s: string) {
  const map: Record<string, string> = {
    active: "bg-success/10 text-success border-success/20",
    paused: "bg-warning/15 text-warning-foreground border-warning/30",
    draft: "bg-muted text-muted-foreground border-border",
    expired: "bg-muted/60 text-muted-foreground border-border",
  };
  return `inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-md border ${map[s] ?? map.draft}`;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState<401 | 403 | null>(null);
  const [tab, setTab] = useState("active");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setAccessDenied(null);
    try {
      const res = await fetch("/api/campaigns");
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(res.status);
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    } catch {
      toast.error("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCampaigns();
  }, [fetchCampaigns]);

  const handleSaved = (campaign: Campaign) => {
    setCampaigns((prev) => {
      const exists = prev.some((c) => c.id === campaign.id);
      return exists
        ? prev.map((c) => (c.id === campaign.id ? { ...c, ...campaign } : c))
        : [{ ...campaign, stats: undefined }, ...prev];
    });
    if (["active", "paused", "draft", "expired"].includes(campaign.status)) {
      setTab(campaign.status);
    }
    void fetchCampaigns();
  };

  const counts = {
    active: campaigns.filter((c) => c.status === "active").length,
    paused: campaigns.filter((c) => c.status === "paused").length,
    draft: campaigns.filter((c) => c.status === "draft").length,
    expired: campaigns.filter((c) => c.status === "expired").length,
  };
  const filtered = campaigns.filter((c) => c.status === tab);

  const updateStatus = async (c: Campaign, newStatus: Campaign["status"]) => {
    try {
      const res = await fetch("/api/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, status: newStatus }),
      });
      if (!res.ok) throw new Error();
      setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: newStatus } : x)));
      toast.success(`Campaign ${STATUS_COPY[newStatus].toLowerCase()}`);
    } catch {
      toast.error("Failed to update campaign");
    }
  };

  const remove = async (c: Campaign) => {
    try {
      const res = await fetch(`/api/campaigns?id=${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCampaigns((prev) => prev.filter((x) => x.id !== c.id));
      toast.success("Campaign deleted");
    } catch {
      toast.error("Failed to delete campaign");
    }
  };

  if (accessDenied) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Campaign Settings</h1>
        <AccessGate status={accessDenied} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaign Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visit-frequency rewards — configure loyalty credits and discounts without code changes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchCampaigns} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" /> Create campaign
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">Active ({counts.active})</TabsTrigger>
          <TabsTrigger value="paused">Paused ({counts.paused})</TabsTrigger>
          <TabsTrigger value="draft">Drafts ({counts.draft})</TabsTrigger>
          <TabsTrigger value="expired">Expired ({counts.expired})</TabsTrigger>
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
              <Gift className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <h3 className="mt-3 text-sm font-medium">
                No {STATUS_COPY[tab].toLowerCase()} campaigns
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Create a campaign to reward customers based on visit frequency.
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
                Create campaign
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border bg-card p-5 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <Link href={`/campaigns/${c.id}`} className="min-w-0 flex-1 group">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold group-hover:text-primary transition-colors">
                          {c.name}
                        </h3>
                        <span className={statusBadge(c.status)}>{STATUS_COPY[c.status]}</span>
                      </div>
                      {c.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {c.description}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground mt-1.5">
                        {c.visit_count}+ visits →{" "}
                        {formatRewardLabel(c.reward_type, c.reward_amount)}
                      </p>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground mt-3">
                        {c.stats && (
                          <>
                            <span>
                              Assigned:{" "}
                              <span className="text-foreground font-medium">
                                {c.stats.rewards_assigned}
                              </span>
                            </span>
                            <span>
                              Sent:{" "}
                              <span className="text-foreground font-medium">
                                {c.stats.emails_sent}
                              </span>
                            </span>
                            <span>
                              Pending:{" "}
                              <span className="text-foreground font-medium">{c.stats.pending}</span>
                            </span>
                          </>
                        )}
                        <span className="flex items-center gap-0.5 text-primary">
                          View dashboard <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/campaigns/${c.id}`}>View dashboard</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(c);
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        {c.status === "active" && (
                          <DropdownMenuItem onClick={() => updateStatus(c, "paused")}>
                            Pause
                          </DropdownMenuItem>
                        )}
                        {(c.status === "paused" || c.status === "draft") && (
                          <DropdownMenuItem onClick={() => updateStatus(c, "active")}>
                            Activate
                          </DropdownMenuItem>
                        )}
                        {c.status !== "expired" && (
                          <DropdownMenuItem onClick={() => updateStatus(c, "expired")}>
                            Mark expired
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => remove(c)} className="text-destructive">
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

      <CampaignModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={editing}
        onSaved={handleSaved}
      />
    </div>
  );
}
