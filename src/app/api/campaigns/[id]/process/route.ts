import { NextRequest, NextResponse } from "next/server";
import { processCampaign } from "@/lib/campaigns/process";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const result = await processCampaign(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("POST /api/campaigns/[id]/process error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("not found")
      ? 404
      : message.includes("Only active")
        ? 400
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
