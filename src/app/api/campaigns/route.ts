import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { mapCampaignRow, computeStats, mapRecipientRow } from "@/lib/campaigns/db";
import { countEligibleCustomers } from "@/lib/campaigns/customers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sb = getSupabase();
    const previewVisits = req.nextUrl.searchParams.get("preview_visits");

    if (previewVisits) {
      const count = await countEligibleCustomers(sb, Number(previewVisits));
      return NextResponse.json({ eligible_count: count });
    }

    const { data, error } = await sb
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const campaigns = (data ?? []).map(mapCampaignRow);

    const withStats = await Promise.all(
      campaigns.map(async (c) => {
        const { data: recipients } = await sb
          .from("campaign_recipients")
          .select("*")
          .eq("campaign_id", c.id);
        const mapped = (recipients ?? []).map((r) => mapRecipientRow(r));
        return { ...c, stats: computeStats(mapped) };
      }),
    );

    return NextResponse.json({ campaigns: withStats });
  } catch (error) {
    console.error("GET /api/campaigns error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sb = getSupabase();
    const body = await req.json();
    const {
      name,
      description,
      visit_count,
      reward_type,
      reward_amount,
      status,
      trigger_type,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!visit_count || visit_count < 1) {
      return NextResponse.json({ error: "visit_count must be at least 1" }, { status: 400 });
    }
    if (!reward_amount || reward_amount <= 0) {
      return NextResponse.json({ error: "reward_amount must be positive" }, { status: 400 });
    }

    const { data, error } = await sb
      .from("campaigns")
      .insert({
        name: name.trim(),
        description: description?.trim() ?? "",
        trigger_type: trigger_type ?? "visit_count",
        visit_count: Number(visit_count),
        reward_type: reward_type ?? "credit",
        reward_amount: Number(reward_amount),
        status: status ?? "draft",
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: mapCampaignRow(data) });
  } catch (error) {
    console.error("POST /api/campaigns error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const sb = getSupabase();
    const body = await req.json();
    const { id, name, description, visit_count, reward_type, reward_amount, status } = body;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const fields: Record<string, unknown> = {};
    if (name !== undefined) fields.name = name.trim();
    if (description !== undefined) fields.description = description.trim();
    if (visit_count !== undefined) fields.visit_count = Number(visit_count);
    if (reward_type !== undefined) fields.reward_type = reward_type;
    if (reward_amount !== undefined) fields.reward_amount = Number(reward_amount);
    if (status !== undefined) fields.status = status;

    const { data, error } = await sb
      .from("campaigns")
      .update(fields)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: mapCampaignRow(data) });
  } catch (error) {
    console.error("PATCH /api/campaigns error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const sb = getSupabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await sb.from("campaigns").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/campaigns error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
