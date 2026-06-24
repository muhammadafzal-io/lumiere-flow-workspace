import { NextRequest, NextResponse } from "next/server";
import { runScheduledRules } from "@/lib/rules/run-scheduled";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteCtx = { params: Promise<{ id: string }> };

/** Admin: force-run auto-send for one rule (same logic as cron). */
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const result = await runScheduledRules({ ruleId: id, force: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("POST /api/rule/[id]/run-scheduled error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Run failed" },
      { status: 500 },
    );
  }
}
