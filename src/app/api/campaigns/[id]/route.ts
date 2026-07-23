import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { computeStats, mapCampaignRow, mapRecipientRow, mapRewardRow } from "@/lib/campaigns/db";
import { countEligibleCustomers } from "@/lib/campaigns/customers";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const check = await requireApiPermission("campaigns", "View");
  if (!check.ok) return check.response;

  try {
    const { id } = await ctx.params;
    const sb = getSupabase();

    const { data: campaignRow, error } = await sb
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !campaignRow) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const campaign = mapCampaignRow(campaignRow);
    const visitThreshold = Math.max(1, campaign.visit_count);

    const { data: recipients } = await sb
      .from("campaign_recipients")
      .select("*")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false });

    const { data: rewards } = await sb.from("customer_rewards").select("*").eq("campaign_id", id);

    const rewardByCustomer = new Map(
      (rewards ?? []).map((r) => [String(r.customer_id), mapRewardRow(r)]),
    );

    const mappedRecipients = (recipients ?? [])
      .map((r) => {
        const reward = rewardByCustomer.get(String(r.customer_id));
        return mapRecipientRow(r, {
          campaign_name: campaign.name,
          reward_code: reward?.reward_code,
          is_redeemed: reward?.is_redeemed,
        });
      })
      .filter((r) => r.visit_count >= visitThreshold && r.visit_count > 0);

    const stats = computeStats(mappedRecipients);
    const liveEligible = await countEligibleCustomers(sb, visitThreshold);

    return NextResponse.json({
      campaign,
      stats: { ...stats, live_eligible: liveEligible },
      recipients: mappedRecipients,
    });
  } catch (error) {
    console.error("GET /api/campaigns/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
