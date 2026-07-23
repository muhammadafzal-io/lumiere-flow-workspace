import { NextRequest, NextResponse } from "next/server";
import { sendCampaignEmails } from "@/lib/campaigns/send";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const check = await requireApiPermission("campaigns", "Update");
  if (!check.ok) return check.response;

  try {
    const { id } = await ctx.params;
    const result = await sendCampaignEmails(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("POST /api/campaigns/[id]/send error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
