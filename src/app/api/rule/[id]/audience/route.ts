import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { buildRuleAudience } from "@/lib/rules/audience";
import { parseRuleAudienceParams } from "@/lib/rules/audience-config";
import type { Rule } from "@/lib/types";
import { normalizeRuleChannel } from "@/lib/types";

const TABLE = "Rules";

function mapRow(r: Record<string, unknown>): Rule {
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
    trigger_type: (r["Trigger Type"] as Rule["trigger_type"]) ?? "Inactivity",
    trigger_config,
    channel: normalizeRuleChannel(String(r["Channel"] ?? "")),
    message_template: String(r["Message Template"] ?? ""),
    offer_code: r["Incentive Code"] ? String(r["Incentive Code"]) : undefined,
    audience_filter: [],
    created_at: String(r.created_at ?? new Date().toISOString()),
    last_run_at: r["Last Run At"] ? String(r["Last Run At"]) : undefined,
    audience_size: 0,
    sent_30d: 0,
    reply_rate: 0,
    revenue: 0,
  };
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const sb = getSupabase();
    const { data, error } = await sb.from(TABLE).select("*").eq("id", id).single();
    if (error || !data) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const rule = mapRow(data);
    const extraFilters = parseRuleAudienceParams(req.nextUrl.searchParams);
    const audience = await buildRuleAudience(rule, extraFilters);

    return NextResponse.json({ rule, ...audience, filters: extraFilters });
  } catch (error) {
    console.error("GET /api/rule/[id]/audience error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
