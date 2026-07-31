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
import { Tag, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Rule } from "@/lib/types";
import type { RuleAudienceFilters } from "@/lib/rules/audience-config";
import {
  formatOfferSummary,
  offerConfigToTriggerFields,
  parseRuleOffer,
  type RuleOfferType,
} from "@/lib/rules/offer-config";
import { toast } from "sonner";

interface Props {
  rule: Rule;
  filters: RuleAudienceFilters;
  onSaved: () => void;
}

export function RuleOfferPanel({ rule, filters, onSaved }: Props) {
  const parsed = parseRuleOffer(rule);
  const [code, setCode] = useState(parsed.code);
  const [offerType, setOfferType] = useState<RuleOfferType>(parsed.type);
  const [amount, setAmount] = useState(parsed.amount);
  const [allowCustomPromoCode, setAllowCustomPromoCode] = useState(parsed.allowCustomPromoCode);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const o = parseRuleOffer(rule);
    setCode(o.code);
    setOfferType(o.type);
    setAmount(o.amount);
    setAllowCustomPromoCode(o.allowCustomPromoCode);
  }, [rule]);

  const save = async () => {
    setSaving(true);
    try {
      const triggerConfig = {
        ...rule.trigger_config,
        audience_filters: filters,
        ...offerConfigToTriggerFields({ code, type: offerType, amount, allowCustomPromoCode }),
      };
      const res = await fetch("/api/rule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: rule.id,
          ruleName: rule.name,
          status:
            rule.status === "active" ? "Active" : rule.status === "paused" ? "Paused" : "Draft",
          triggerType: rule.trigger_type,
          triggerConfig,
          channel: rule.channel,
          messageTemplate: rule.message_template,
          incentiveCode: code.trim(),
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Coupon settings saved");
      onSaved();
    } catch {
      toast.error("Failed to save coupon settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Tag className="h-4 w-4 text-primary" />
          Offer & coupon
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Set the promo code and dollar or percent amount. Use{" "}
          <span className="font-mono">{`{credit_code}`}</span>,{" "}
          <span className="font-mono">{`{offer_amount}`}</span>, or{" "}
          <span className="font-mono">{`{offer_summary}`}</span> in your email message.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <div className="pr-3">
          <Label htmlFor="allow-custom-promo-panel" className="text-xs cursor-pointer">
            Allow Custom Promo Code
          </Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            On: edit the promo code, offer type, and amount below. Off: the saved offer is locked
            and sent as-is.
          </p>
        </div>
        <Switch
          id="allow-custom-promo-panel"
          checked={allowCustomPromoCode}
          onCheckedChange={setAllowCustomPromoCode}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1">
          <Label className="text-xs text-muted-foreground">Promo code</Label>
          <Input
            className="h-8 mt-1 text-sm font-mono disabled:opacity-60"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            disabled={!allowCustomPromoCode}
            placeholder="e.g. SPRING30"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Offer type</Label>
          <Select
            value={offerType}
            onValueChange={(v) => setOfferType(v as RuleOfferType)}
            disabled={!allowCustomPromoCode}
          >
            <SelectTrigger className="h-8 mt-1 text-sm disabled:opacity-60">
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
            {offerType === "credit" ? "Amount ($)" : "Discount (%)"}
          </Label>
          <Input
            type="number"
            min={1}
            max={offerType === "discount" ? 100 : 10000}
            className="h-8 mt-1 text-sm disabled:opacity-60"
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
            disabled={!allowCustomPromoCode}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Preview: {formatOfferSummary(offerType, amount)}
        {code.trim() ? ` · code ${code.trim()}` : ""}
      </p>

      <Button size="sm" onClick={save} disabled={saving}>
        {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
        Save coupon
      </Button>
    </div>
  );
}
