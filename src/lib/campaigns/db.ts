import type { Campaign, CampaignRecipient, CampaignStats, CustomerReward } from "@/lib/types";

export function mapCampaignRow(row: Record<string, unknown>): Campaign {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    trigger_type: (row.trigger_type as Campaign["trigger_type"]) ?? "visit_count",
    visit_count: Number(row.visit_count ?? 0),
    reward_type: (row.reward_type as Campaign["reward_type"]) ?? "credit",
    reward_amount: Number(row.reward_amount ?? 0),
    status: (row.status as Campaign["status"]) ?? "draft",
    processing_status: (row.processing_status as Campaign["processing_status"]) ?? "idle",
    last_processed_at: row.last_processed_at ? String(row.last_processed_at) : undefined,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export function mapRecipientRow(
  row: Record<string, unknown>,
  extras?: { campaign_name?: string; reward_code?: string; is_redeemed?: boolean },
): CampaignRecipient {
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    customer_id: String(row.customer_id),
    customer_name: String(row.customer_name ?? ""),
    customer_email: String(row.customer_email ?? ""),
    visit_count: Number(row.visit_count ?? 0),
    reward_amount: Number(row.reward_amount ?? 0),
    status: (row.status as CampaignRecipient["status"]) ?? "pending",
    sent_at: row.sent_at ? String(row.sent_at) : undefined,
    redeemed_at: row.redeemed_at ? String(row.redeemed_at) : undefined,
    created_at: String(row.created_at ?? new Date().toISOString()),
    campaign_name: extras?.campaign_name,
    reward_code: extras?.reward_code,
    is_redeemed: extras?.is_redeemed,
  };
}

export function mapRewardRow(row: Record<string, unknown>): CustomerReward {
  return {
    id: String(row.id),
    customer_id: String(row.customer_id),
    campaign_id: String(row.campaign_id),
    reward_type: (row.reward_type as CustomerReward["reward_type"]) ?? "credit",
    reward_amount: Number(row.reward_amount ?? 0),
    reward_code: String(row.reward_code ?? ""),
    is_redeemed: Boolean(row.is_redeemed),
    redeemed_at: row.redeemed_at ? String(row.redeemed_at) : undefined,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export function computeStats(recipients: CampaignRecipient[]): CampaignStats {
  const rewards_assigned = recipients.length;
  const pending = recipients.filter((r) => r.status === "pending").length;
  const failed = recipients.filter((r) => r.status === "failed").length;
  const emails_sent = recipients.filter(
    (r) => r.status === "sent" || r.status === "redeemed",
  ).length;
  const redeemed = recipients.filter((r) => r.status === "redeemed" || r.is_redeemed).length;

  return {
    eligible: rewards_assigned,
    rewards_assigned,
    emails_sent,
    pending,
    failed,
    redeemed,
    not_redeemed: Math.max(0, emails_sent - redeemed),
  };
}

export function formatRewardLabel(type: Campaign["reward_type"], amount: number): string {
  return type === "credit" ? `$${amount} credit` : `${amount}% discount`;
}
