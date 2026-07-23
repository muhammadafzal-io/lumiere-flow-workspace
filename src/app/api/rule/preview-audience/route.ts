import { NextResponse } from "next/server";
import { buildRuleAudience } from "@/lib/rules/audience";
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

    const extraFilters = channel === "Email" ? { has_email: true as const } : {};

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
