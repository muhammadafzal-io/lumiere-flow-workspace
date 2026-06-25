import { getSupabase } from "@/lib/supabase";
import { fetchEligibleCustomers } from "@/lib/campaigns/customers";
import { mapCampaignRow } from "@/lib/campaigns/db";
import { generateRewardCode } from "@/lib/campaigns/reward-code";
import type { Campaign } from "@/lib/types";

export interface ProcessCampaignResult {
  campaign: Campaign;
  eligible_found: number;
  recipients_created: number;
  rewards_created: number;
  skipped_duplicates: number;
}

/**
 * Idempotent campaign processing:
 * 1. Scan Clients for visit_count >= campaign.visit_count
 * 2. Upsert campaign_recipients (skip existing via UNIQUE constraint)
 * 3. Upsert customer_rewards (skip existing via UNIQUE constraint)
 */
export async function processCampaign(campaignId: string): Promise<ProcessCampaignResult> {
  const sb = getSupabase();

  const { data: campaignRow, error: fetchErr } = await sb
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (fetchErr || !campaignRow) {
    throw new Error(fetchErr?.message ?? "Campaign not found");
  }

  const campaign = mapCampaignRow(campaignRow);

  if (campaign.status !== "active") {
    throw new Error("Only active campaigns can be processed");
  }

  await sb.from("campaigns").update({ processing_status: "processing" }).eq("id", campaignId);

  try {
    const eligible = await fetchEligibleCustomers(sb, campaign.visit_count);
    let recipientsCreated = 0;
    let rewardsCreated = 0;
    let skippedDuplicates = 0;

    for (const customer of eligible) {
      const { data: existingRecipient } = await sb
        .from("campaign_recipients")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("customer_id", customer.id)
        .maybeSingle();

      if (existingRecipient) {
        skippedDuplicates++;
        continue;
      }

      const { error: recipientErr } = await sb.from("campaign_recipients").insert({
        campaign_id: campaignId,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_email: customer.email,
        visit_count: customer.visit_count,
        reward_amount: campaign.reward_amount,
        status: "pending",
      });

      if (recipientErr) {
        if (recipientErr.code === "23505") {
          skippedDuplicates++;
          continue;
        }
        throw new Error(recipientErr.message);
      }
      recipientsCreated++;

      const { data: existingReward } = await sb
        .from("customer_rewards")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("customer_id", customer.id)
        .maybeSingle();

      if (!existingReward) {
        let rewardCode = generateRewardCode(customer.name, campaignId);
        let attempts = 0;
        while (attempts < 5) {
          const { error: rewardErr } = await sb.from("customer_rewards").insert({
            customer_id: customer.id,
            campaign_id: campaignId,
            reward_type: campaign.reward_type,
            reward_amount: campaign.reward_amount,
            reward_code: rewardCode,
            is_redeemed: false,
          });
          if (!rewardErr) {
            rewardsCreated++;
            break;
          }
          if (rewardErr.code === "23505") {
            skippedDuplicates++;
            break;
          }
          rewardCode = generateRewardCode(customer.name, campaignId);
          attempts++;
        }
      } else {
        skippedDuplicates++;
      }
    }

    const now = new Date().toISOString();
    const { data: updated } = await sb
      .from("campaigns")
      .update({
        processing_status: "completed",
        last_processed_at: now,
      })
      .eq("id", campaignId)
      .select()
      .single();

    return {
      campaign: mapCampaignRow(updated ?? campaignRow),
      eligible_found: eligible.length,
      recipients_created: recipientsCreated,
      rewards_created: rewardsCreated,
      skipped_duplicates: skippedDuplicates,
    };
  } catch (err) {
    await sb.from("campaigns").update({ processing_status: "failed" }).eq("id", campaignId);
    throw err;
  }
}

/** Process all active campaigns (for cron Phase 2). */
export async function processAllActiveCampaigns(): Promise<
  Array<{ campaignId: string; name: string; result?: ProcessCampaignResult; error?: string }>
> {
  const sb = getSupabase();
  const { data: campaigns, error } = await sb
    .from("campaigns")
    .select("id, name")
    .eq("status", "active");

  if (error) throw new Error(error.message);

  const results: Array<{
    campaignId: string;
    name: string;
    result?: ProcessCampaignResult;
    error?: string;
  }> = [];

  for (const c of campaigns ?? []) {
    try {
      const result = await processCampaign(String(c.id));
      results.push({ campaignId: String(c.id), name: String(c.name), result });
    } catch (err) {
      results.push({
        campaignId: String(c.id),
        name: String(c.name),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
