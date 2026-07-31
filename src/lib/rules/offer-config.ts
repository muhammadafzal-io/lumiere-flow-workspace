import type { CampaignRewardType } from "@/lib/types";
import type { Rule } from "@/lib/types";

export type RuleOfferType = CampaignRewardType;

export interface RuleOfferConfig {
  code: string;
  type: RuleOfferType;
  amount: number;
  /** When true, `code` is admin-controlled and used as-is for every recipient — including on
   * Birthday rules, which otherwise auto-generate a unique code per customer. Defaults to false
   * so existing rules keep their current trigger-type default behavior unchanged. */
  allowCustomPromoCode: boolean;
}

export function parseRuleOffer(rule: Pick<Rule, "offer_code" | "trigger_config">): RuleOfferConfig {
  const cfg = rule.trigger_config ?? {};
  const type: RuleOfferType = cfg.offer_type === "discount" ? "discount" : "credit";
  const amount = Number(cfg.offer_amount);
  return {
    code: rule.offer_code?.trim() ?? "",
    type,
    amount: Number.isFinite(amount) && amount > 0 ? amount : type === "discount" ? 20 : 50,
    allowCustomPromoCode: cfg.allow_custom_promo_code === true,
  };
}

export function offerConfigToTriggerFields(offer: RuleOfferConfig): Record<string, unknown> {
  return {
    offer_type: offer.type,
    offer_amount: offer.amount,
    allow_custom_promo_code: offer.allowCustomPromoCode,
  };
}

export function formatOfferSummary(type: RuleOfferType, amount: number): string {
  if (type === "discount") return `${amount}% off`;
  return `$${amount} credit`;
}

export function formatOfferSummaryFromRule(
  rule: Pick<Rule, "offer_code" | "trigger_config">,
): string {
  const o = parseRuleOffer(rule);
  if (!o.code && o.amount <= 0) return "";
  const summary = formatOfferSummary(o.type, o.amount);
  return o.code ? `${summary} (code ${o.code})` : summary;
}
