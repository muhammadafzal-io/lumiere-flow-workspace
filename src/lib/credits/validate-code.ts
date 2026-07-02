import "server-only";

import {
  getClientByCreditCode,
  getClientById,
  lookupClientByPhone,
} from "@/lib/integrations/airtable";
import type { Client } from "@/types";
import { getSupabase } from "@/lib/supabase";
import { formatOfferSummary, parseRuleOffer } from "@/lib/rules/offer-config";
import type { Rule } from "@/lib/types";
import { mapCampaignRow } from "@/lib/campaigns/db";
import { extractPhoneForLookup, phoneDigits, phonesMatch } from "@/lib/phone";
import { phoneRequiredForPromoError } from "@/lib/credits/promo-code-input";

export type PromoCodeType = "birthday" | "rule" | "campaign";

export type PromoCodeValidationResult =
  | { valid: false; error: string; clientName?: string }
  | {
      valid: true;
      code: string;
      codeType: PromoCodeType;
      offerType: "credit" | "discount";
      offerAmount: number;
      creditAmount?: number;
      discountPercent?: number;
      offerSummary: string;
      clientName?: string;
      clientId?: string;
      ruleName?: string;
      campaignName?: string;
      expiresAt?: string | null;
      daysRemaining?: number | null;
      message: string;
    };

export type ValidatePromoCodeOptions = {
  phone: string;
};

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function clientsSharePhone(a: Client, b: Client): boolean {
  if (a.id && b.id && a.id === b.id) return true;
  if (a.phone && b.phone && phonesMatch(a.phone, b.phone)) return true;
  return false;
}

async function resolveCallerClient(phone: string): Promise<Client | null> {
  const normalized = extractPhoneForLookup(phone.trim());
  if (!normalized || phoneDigits(normalized).length < 7) return null;
  return lookupClientByPhone(normalized);
}

function mapRuleRow(r: Record<string, unknown>): Rule {
  let trigger_config: Record<string, unknown> = {};
  try {
    trigger_config = JSON.parse(String(r["Trigger Config"] ?? "{}"));
  } catch {
    // ignore
  }
  return {
    id: String(r.id),
    name: String(r["Rule Name"] ?? ""),
    status: String(r["Status"] ?? "draft").toLowerCase() as Rule["status"],
    trigger_type: (r["Trigger Type"] as Rule["trigger_type"]) ?? "Custom",
    trigger_config,
    audience_filter: [],
    channel: "Email",
    message_template: String(r["Message Template"] ?? ""),
    offer_code: r["Incentive Code"] ? String(r["Incentive Code"]) : undefined,
    created_at: String(r.created_at ?? new Date().toISOString()),
    audience_size: 0,
    sent_30d: 0,
    reply_rate: 0,
    revenue: 0,
  };
}

function buildValidMessage(opts: {
  offerSummary: string;
  sourceLabel: string;
  clientName?: string;
  expiresAt?: string | null;
  daysRemaining?: number | null;
}): string {
  const who = opts.clientName ? ` for ${opts.clientName}` : "";
  let msg = `Valid! ${opts.offerSummary}${who} (${opts.sourceLabel}).`;
  if (opts.expiresAt && opts.daysRemaining != null) {
    msg += ` Expires ${opts.expiresAt} (${opts.daysRemaining} days remaining).`;
  }
  msg += " Staff will apply the discount at checkout.";
  return msg;
}

async function validateBirthdayCode(
  code: string,
  caller: Client,
): Promise<PromoCodeValidationResult | null> {
  const result = await getClientByCreditCode(code);
  if (!result) return null;

  const { client, codeInfo } = result;
  if (!clientsSharePhone(client, caller)) {
    return {
      valid: false,
      error: "This birthday code is not registered to this phone number.",
      clientName: client.name,
    };
  }
  if (codeInfo.isUsed) {
    return { valid: false, error: "Code already redeemed", clientName: client.name };
  }
  if (codeInfo.isExpired) {
    return {
      valid: false,
      error: `Code expired on ${codeInfo.expiresAt}`,
      clientName: client.name,
    };
  }

  const offerSummary = `$${codeInfo.creditAmount} credit`;
  return {
    valid: true,
    code: codeInfo.code,
    codeType: "birthday",
    offerType: "credit",
    offerAmount: codeInfo.creditAmount,
    creditAmount: codeInfo.creditAmount,
    offerSummary,
    clientName: client.name,
    clientId: client.id,
    expiresAt: codeInfo.expiresAt,
    daysRemaining: codeInfo.daysRemaining,
    message: buildValidMessage({
      offerSummary,
      sourceLabel: "birthday credit",
      clientName: client.name,
      expiresAt: codeInfo.expiresAt,
      daysRemaining: codeInfo.daysRemaining,
    }),
  };
}

async function validateRuleOfferCode(
  code: string,
  caller: Client,
): Promise<PromoCodeValidationResult | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("Rules").select("*").ilike("Incentive Code", code);
  if (error) throw new Error(error.message);
  if (!data?.length) return null;

  const row = data.find((r) => normalizeCode(String(r["Incentive Code"] ?? "")) === code);
  if (!row) return null;

  const rule = mapRuleRow(row as Record<string, unknown>);
  if (rule.status !== "active") {
    return {
      valid: false,
      error: `This offer code is not active (rule "${rule.name}" is ${rule.status})`,
    };
  }

  const offer = parseRuleOffer(rule);
  if (!offer.code) return null;

  const offerSummary = formatOfferSummary(offer.type, offer.amount);
  return {
    valid: true,
    code: offer.code,
    codeType: "rule",
    offerType: offer.type,
    offerAmount: offer.amount,
    creditAmount: offer.type === "credit" ? offer.amount : undefined,
    discountPercent: offer.type === "discount" ? offer.amount : undefined,
    offerSummary,
    clientName: caller.name,
    clientId: caller.id,
    ruleName: rule.name,
    message: buildValidMessage({
      offerSummary,
      sourceLabel: rule.name,
      clientName: caller.name,
    }),
  };
}

async function validateCampaignRewardCode(
  code: string,
  caller: Client,
): Promise<PromoCodeValidationResult | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("customer_rewards")
    .select("*, campaigns(name, status)")
    .ilike("reward_code", code);
  if (error) throw new Error(error.message);
  if (!data?.length) return null;

  const row = data.find((r) => normalizeCode(String(r.reward_code ?? "")) === code);
  if (!row) return null;

  const rewardOwner = await getClientById(String(row.customer_id)).catch(() => null);
  if (!rewardOwner || !clientsSharePhone(rewardOwner, caller)) {
    return {
      valid: false,
      error: "This reward code is not registered to this phone number.",
      clientName: rewardOwner?.name,
    };
  }

  const campaignRaw = row.campaigns as Record<string, unknown> | null;
  const campaign = campaignRaw ? mapCampaignRow({ ...campaignRaw, id: row.campaign_id }) : null;
  if (campaign && campaign.status !== "active") {
    return {
      valid: false,
      error: `This loyalty reward is not active (campaign "${campaign.name}" is ${campaign.status})`,
    };
  }

  if (row.is_redeemed) {
    return { valid: false, error: "Code already redeemed" };
  }

  const rewardType = (row.reward_type as "credit" | "discount") ?? "credit";
  const rewardAmount = Number(row.reward_amount ?? 0);
  const offerSummary = formatOfferSummary(rewardType, rewardAmount);

  return {
    valid: true,
    code: normalizeCode(String(row.reward_code)),
    codeType: "campaign",
    offerType: rewardType,
    offerAmount: rewardAmount,
    creditAmount: rewardType === "credit" ? rewardAmount : undefined,
    discountPercent: rewardType === "discount" ? rewardAmount : undefined,
    offerSummary,
    clientName: caller.name,
    clientId: caller.id,
    campaignName: campaign?.name,
    message: buildValidMessage({
      offerSummary,
      sourceLabel: campaign?.name ? `campaign: ${campaign.name}` : "loyalty reward",
      clientName: caller.name,
    }),
  };
}

/** Validate birthday, rule offer, and campaign reward codes (chat + voice + checkout). */
export async function validatePromoCode(
  code: string,
  opts: ValidatePromoCodeOptions,
): Promise<PromoCodeValidationResult> {
  const normalized = normalizeCode(code);
  if (!normalized) {
    return { valid: false, error: "Code is required" };
  }

  const phone = String(opts.phone ?? "").trim();
  if (!phone || phoneDigits(extractPhoneForLookup(phone)).length < 7) {
    return { valid: false, error: phoneRequiredForPromoError() };
  }

  const caller = await resolveCallerClient(phone);
  if (!caller) {
    return {
      valid: false,
      error:
        "No client record found for this phone number. Save the client's name and phone via upsert_client first, then validate the code.",
    };
  }

  const birthday = await validateBirthdayCode(normalized, caller);
  if (birthday) return birthday;

  const rule = await validateRuleOfferCode(normalized, caller);
  if (rule) return rule;

  const campaign = await validateCampaignRewardCode(normalized, caller);
  if (campaign) return campaign;

  return { valid: false, error: "Code not found" };
}
