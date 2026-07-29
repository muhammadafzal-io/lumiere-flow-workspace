import { NextResponse } from "next/server";
import { buildRuleAudience } from "@/lib/rules/audience";
import { defaultRuleAudienceFilters } from "@/lib/rules/audience-config";
import type { Channel, Rule, TriggerType } from "@/lib/types";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const check = await requireApiPermission("rules", "View");
  if (!check.ok) return check.response;

  try {
    const body = await req.json();
    const triggerType = body.triggerType as TriggerType;
    const triggerConfig = (body.triggerConfig ?? {}) as Record<string, unknown>;
    const channel = (body.channel ?? "Email") as Channel;

    if (!triggerType) {
      return NextResponse.json({ error: "triggerType is required" }, { status: 400 });
    }

    const rule = {
      id: "preview",
      name: "Preview",
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      audience_filter: [],
      channel,
      message_template: "",
      status: "draft" as const,
      created_at: new Date().toISOString(),
      audience_size: 0,
      sent_30d: 0,
      reply_rate: 0,
      revenue: 0,
    } satisfies Rule;

    // Must match the run page's default filter state exactly — buildRuleAudience merges these
    // extraFilters over any audience_filters stored on the rule (e.g. from an AI-parsed
    // description), and the run page always sends a fully-populated filter set (even at
    // defaults), which fully overrides them. Replicate that here, or a stale/conflicting stored
    // audience_filters silently leaks through in the preview but not on the run page, producing a
    // different (often much lower) count than what will actually be sent.
    const extraFilters = { ...defaultRuleAudienceFilters(), status: [], treatment: [] };

    const { total, eligible, rows } = await buildRuleAudience(rule, extraFilters);

    return NextResponse.json({ total, eligible, rows });
  } catch (error) {
    console.error("POST /api/rule/preview-audience error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 },
    );
  }
}
