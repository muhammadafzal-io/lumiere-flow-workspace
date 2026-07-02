import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendRuleEmails } from "@/lib/rules/send";
import { recordRuleSends } from "@/lib/rules/rule-sends";
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
    audience_size: 0,
    sent_30d: 0,
    reply_rate: 0,
    revenue: 0,
  };
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const { clientIds } = body as {
      clientIds: string[];
      recipients?: Array<{ id: string; name: string; email?: string; phone?: string }>;
    };

    const sb = getSupabase();
    const { data, error } = await sb.from(TABLE).select("*").eq("id", id).single();
    if (error || !data) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const rule = mapRow(data);

    let recipients = body.recipients;
    if (!recipients?.length && clientIds?.length) {
      const { buildRuleAudience } = await import("@/lib/rules/audience");
      const audience = await buildRuleAudience(rule);
      const idSet = new Set(clientIds);
      recipients = audience.rows
        .filter((r) => idSet.has(r.id))
        .map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          phone: r.phone,
          treatment: r.treatment,
        }));
    }

    if (!recipients?.length) {
      return NextResponse.json({ error: "No recipients selected" }, { status: 400 });
    }

    const result = await sendRuleEmails(rule, recipients, { trigger: "manual" });
    await recordRuleSends(rule.id, result.details);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("POST /api/rule/[id]/send error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
