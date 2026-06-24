"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Campaign, CampaignRewardType, CampaignStatus } from "@/lib/types";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const VISIT_PRESETS = [
  { label: "5 Visits", value: 5 },
  { label: "10 Visits", value: 10 },
  { label: "15 Visits", value: 15 },
  { label: "Custom Visit Count", value: "custom" as const },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: Campaign | null;
  onSaved?: (campaign: Campaign) => void;
}

export function CampaignModal({ open, onOpenChange, editing, onSaved }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visitPreset, setVisitPreset] = useState<string>("5");
  const [customVisits, setCustomVisits] = useState(20);
  const [rewardType, setRewardType] = useState<CampaignRewardType>("credit");
  const [rewardAmount, setRewardAmount] = useState(50);
  const [status, setStatus] = useState<CampaignStatus>("draft");
  const [eligiblePreview, setEligiblePreview] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const visitCount =
    visitPreset === "custom" ? customVisits : Number(visitPreset);

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name);
        setDescription(editing.description);
        const preset = [5, 10, 15].includes(editing.visit_count)
          ? String(editing.visit_count)
          : "custom";
        setVisitPreset(preset);
        setCustomVisits(editing.visit_count);
        setRewardType(editing.reward_type);
        setRewardAmount(editing.reward_amount);
        setStatus(editing.status);
      } else {
        setName("");
        setDescription("");
        setVisitPreset("5");
        setCustomVisits(20);
        setRewardType("credit");
        setRewardAmount(50);
        setStatus("draft");
      }
      setEligiblePreview(null);
    }
  }, [open, editing]);

  useEffect(() => {
    if (!open || visitCount < 1) return;
    const t = setTimeout(() => {
      setPreviewLoading(true);
      fetch(`/api/campaigns?preview_visits=${visitCount}`)
        .then((r) => r.json())
        .then((d) => setEligiblePreview(d.eligible_count ?? null))
        .catch(() => setEligiblePreview(null))
        .finally(() => setPreviewLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [open, visitCount]);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (visitCount < 1) {
      toast.error("Visit count must be at least 1");
      return;
    }
    if (rewardAmount <= 0) {
      toast.error("Reward value must be positive");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        visit_count: visitCount,
        reward_type: rewardType,
        reward_amount: rewardAmount,
        status,
        trigger_type: "visit_count",
      };

      const res = await fetch("/api/campaigns", {
        method: editing?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing?.id ? { id: editing.id, ...payload } : payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      const data = await res.json();
      toast.success(editing ? "Campaign updated" : "Campaign created");
      onSaved?.(data.data);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save campaign");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit campaign" : "Create campaign"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Campaign name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
              placeholder="e.g., 5-Visit Loyalty Reward"
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5 min-h-[72px]"
              placeholder="Internal note or message context for this campaign"
            />
          </div>

          <div>
            <Label>Visit trigger</Label>
            <Select value={visitPreset} onValueChange={setVisitPreset}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIT_PRESETS.map((p) => (
                  <SelectItem key={String(p.value)} value={String(p.value)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {visitPreset === "custom" && (
              <Input
                type="number"
                min={1}
                value={customVisits}
                onChange={(e) => setCustomVisits(+e.target.value)}
                className="mt-2"
                placeholder="Custom visit count"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Reward type</Label>
              <Select
                value={rewardType}
                onValueChange={(v) => setRewardType(v as CampaignRewardType)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="discount">Discount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{rewardType === "credit" ? "Amount ($)" : "Discount (%)"}</Label>
              <Input
                type="number"
                min={1}
                value={rewardAmount}
                onChange={(e) => setRewardAmount(+e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as CampaignStatus)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-secondary/40 p-3 text-sm">
            <span className="text-muted-foreground">Estimated eligible customers: </span>
            {previewLoading ? (
              <Loader2 className="inline h-3.5 w-3.5 animate-spin ml-1" />
            ) : eligiblePreview !== null ? (
              <span className="font-semibold">{eligiblePreview}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Customers with {visitCount}+ visits (live scan)
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {editing ? "Save changes" : "Create campaign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
