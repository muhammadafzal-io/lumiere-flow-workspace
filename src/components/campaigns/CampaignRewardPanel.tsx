"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Gift, Loader2 } from "lucide-react";
import type { Campaign, CampaignRewardType } from "@/lib/types";
import { formatRewardLabel } from "@/lib/campaigns/db";
import { toast } from "sonner";

interface Props {
  campaign: Campaign;
  onSaved: () => void;
}

export function CampaignRewardPanel({ campaign, onSaved }: Props) {
  const [rewardType, setRewardType] = useState<CampaignRewardType>(campaign.reward_type);
  const [rewardAmount, setRewardAmount] = useState(campaign.reward_amount);
  const [visitCount, setVisitCount] = useState(campaign.visit_count);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRewardType(campaign.reward_type);
    setRewardAmount(campaign.reward_amount);
    setVisitCount(campaign.visit_count);
  }, [campaign]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: campaign.id,
          reward_type: rewardType,
          reward_amount: rewardAmount,
          visit_count: visitCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      toast.success("Coupon settings saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save coupon settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Gift className="h-4 w-4 text-primary" />
          Coupon & reward
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Adjust the visit threshold and credit or discount amount. New amounts apply to the next
          scan; already-assigned recipients keep their original reward until you re-process.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Minimum visits</Label>
          <Input
            type="number"
            min={1}
            className="h-8 mt-1 text-sm"
            value={visitCount}
            onChange={(e) => setVisitCount(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Reward type</Label>
          <Select
            value={rewardType}
            onValueChange={(v) => setRewardType(v as CampaignRewardType)}
          >
            <SelectTrigger className="h-8 mt-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="credit">Credit ($)</SelectItem>
              <SelectItem value="discount">Discount (%)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">
            {rewardType === "credit" ? "Amount ($)" : "Discount (%)"}
          </Label>
          <Input
            type="number"
            min={1}
            max={rewardType === "discount" ? 100 : 10000}
            className="h-8 mt-1 text-sm"
            value={rewardAmount}
            onChange={(e) => setRewardAmount(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Preview: {visitCount}+ visits → {formatRewardLabel(rewardType, rewardAmount)}
      </p>

      <Button size="sm" onClick={save} disabled={saving}>
        {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
        Save coupon
      </Button>
    </div>
  );
}
