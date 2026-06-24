import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { AINotConfiguredError, parseAudienceQueryWithAI } from "@/lib/rules/ai";
import type { Rule } from "@/lib/types";
import { normalizeRuleChannel } from "@/lib/types";

export const dynamic = "force-dynamic";

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
    trigger_type: (r["Trigger Type"] as Rule["trigger_type"]) ?? "Custom",
    trigger_config,
    channel: normalizeRuleChannel(String(r["Channel"] ?? "")),
    message_template: String(r["Message Template"] ?? ""),
    offer_code: r["Incentive Code"] ? String(r["Incentive Code"]) : undefined,
    audience_filter: [],
    created_at: String(r.created_at ?? new Date().toISOString()),
    audience_size: 0,
    sent_30d: 0,
    reply_rate: 0,
    revenue: 0,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query, ruleId } = body as { query?: string; ruleId?: string };

    if (!query?.trim()) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    let rule: Rule | undefined;
    if (ruleId) {
      const sb = getSupabase();
      const { data } = await sb.from("Rules").select("*").eq("id", ruleId).single();
      if (data) rule = mapRow(data);
    }

    const result = await parseAudienceQueryWithAI(query.trim(), rule);
    return NextResponse.json({ ok: true, ...result, source: "openai" });
  } catch (error) {
    if (error instanceof AINotConfiguredError) {
      return NextResponse.json(
        { error: "AI is not configured. Add OPENAI_API_KEY to .env.local" },
        { status: 503 },
      );
    }
    console.error("POST /api/rule/audience-query error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse query" },
      { status: 500 },
    );
  }
}
