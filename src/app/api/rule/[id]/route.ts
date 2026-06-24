import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { normalizeRuleChannel } from "@/lib/types";

const TABLE = "Rules";

function mapRow(r: Record<string, unknown>) {
  let trigger_config: Record<string, unknown> = {};
  try {
    trigger_config = JSON.parse(String(r["Trigger Config"] ?? "{}"));
  } catch {
    // ignore
  }
  return {
    id: r.id,
    name: r["Rule Name"] ?? "",
    status: String(r["Status"] ?? "draft").toLowerCase(),
    trigger_type: r["Trigger Type"] ?? "Inactivity",
    trigger_config,
    channel: normalizeRuleChannel(String(r["Channel"] ?? "")),
    message_template: r["Message Template"] ?? "",
    offer_code: r["Incentive Code"] || undefined,
    audience_filter: [],
    created_at: r.created_at ?? new Date().toISOString(),
    last_run_at: r["Last Run At"] ?? undefined,
    audience_size: 0,
    sent_30d: 0,
    reply_rate: 0,
    revenue: 0,
  };
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const sb = getSupabase();
    const { data, error } = await sb.from(TABLE).select("*").eq("id", id).single();
    if (error || !data) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }
    return NextResponse.json({ rule: mapRow(data) });
  } catch (error) {
    console.error("GET /api/rule/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
