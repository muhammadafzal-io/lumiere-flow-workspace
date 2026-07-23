"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  PlayCircle,
  Mail,
  RefreshCw,
  Users,
  Gift,
  Send,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import type { Campaign, CampaignRecipient, CampaignStats } from "@/lib/types";
import { formatRewardLabel } from "@/lib/campaigns/db";
import { CampaignRewardPanel } from "@/components/campaigns/CampaignRewardPanel";
import { AccessGate } from "@/components/rbac/AccessGate";
import { toast } from "sonner";

type StatsWithLive = CampaignStats & { live_eligible?: number };

function recipientBadge(status: CampaignRecipient["status"]) {
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    sent: "bg-blue-500/10 text-blue-700",
    redeemed: "bg-success/10 text-success",
    failed: "bg-destructive/10 text-destructive",
  };
  return map[status] ?? map.pending;
}

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<StatsWithLive | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState<401 | 403 | null>(null);
  const [processing, setProcessing] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setAccessDenied(null);
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(res.status);
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setCampaign(data.campaign);
      setStats(data.stats);
      setRecipients(data.recipients ?? []);
    } catch {
      toast.error("Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  const runProcess = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/process`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Processing failed");
      toast.success(
        `Processed: ${data.recipients_created} new recipients, ${data.skipped_duplicates} skipped`,
      );
      void fetchDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setProcessing(false);
    }
  };

  const runSend = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      toast.success(`Sent ${data.sent} · failed ${data.failed} · skipped ${data.skipped}`);
      void fetchDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/campaigns">
            <ArrowLeft className="h-4 w-4 mr-1" /> Campaigns
          </Link>
        </Button>
        <AccessGate status={accessDenied} />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Campaign not found</p>
        <Button variant="link" asChild className="mt-2">
          <Link href="/campaigns">Back to campaigns</Link>
        </Button>
      </div>
    );
  }

  const statCards = [
    {
      label: "Live eligible",
      value: stats?.live_eligible ?? "—",
      icon: Users,
      hint: `${campaign.visit_count}+ visits in database`,
    },
    {
      label: "Rewards assigned",
      value: stats?.rewards_assigned ?? 0,
      icon: Gift,
      hint: "Recipient records created",
    },
    {
      label: "Emails sent",
      value: stats?.emails_sent ?? 0,
      icon: Send,
      hint: "Successfully delivered",
    },
    {
      label: "Pending",
      value: stats?.pending ?? 0,
      icon: Mail,
      hint: "Awaiting send",
    },
    {
      label: "Failed",
      value: stats?.failed ?? 0,
      icon: AlertCircle,
      hint: "Send errors",
    },
    {
      label: "Redeemed",
      value: stats?.redeemed ?? 0,
      icon: CheckCircle2,
      hint: `${stats?.not_redeemed ?? 0} not redeemed`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
            <Link href="/campaigns">
              <ArrowLeft className="h-4 w-4 mr-1" /> Campaigns
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
          {campaign.description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{campaign.description}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="outline">{campaign.status}</Badge>
            <Badge variant="secondary">
              {campaign.visit_count}+ visits →{" "}
              {formatRewardLabel(campaign.reward_type, campaign.reward_amount)}
            </Badge>
            <Badge variant="outline">Processing: {campaign.processing_status}</Badge>
            {campaign.last_processed_at && (
              <span className="text-xs text-muted-foreground self-center">
                Last processed {new Date(campaign.last_processed_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={fetchDetail}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={runProcess}
            disabled={processing || campaign.status !== "active"}
            className="gap-1.5"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            Scan & assign
          </Button>
          <Button onClick={runSend} disabled={sending} className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send emails
          </Button>
        </div>
      </div>

      <CampaignRewardPanel campaign={campaign} onSaved={fetchDetail} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </div>
            <div className="text-2xl font-semibold mt-1">{s.value}</div>
            <p className="text-[10px] text-muted-foreground mt-1">{s.hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-sm">Recipients</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {recipients.length} total — audit trail preserved for all assignments
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Visits</th>
                <th className="px-5 py-3 font-medium">Reward</th>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Sent</th>
              </tr>
            </thead>
            <tbody>
              {recipients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                    No recipients yet. Activate the campaign and run &quot;Scan & assign&quot;.
                  </td>
                </tr>
              ) : (
                recipients.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-3 font-medium">{r.customer_name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.customer_email || "—"}</td>
                    <td className="px-5 py-3">{r.visit_count}</td>
                    <td className="px-5 py-3">
                      {campaign.reward_type === "credit"
                        ? `$${r.reward_amount}`
                        : `${r.reward_amount}%`}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{r.reward_code ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${recipientBadge(r.status)}`}
                      >
                        {r.status}
                        {r.is_redeemed ? " ✓" : ""}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">
                      {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
