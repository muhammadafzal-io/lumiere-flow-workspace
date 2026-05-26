/* eslint-disable prettier/prettier */
import { NextRequest, NextResponse } from "next/server";
import { readOpsLog } from "@/lib/integrations/google-sheets";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const limit = Math.min(Number(searchParams.get("limit") ?? "500"), 1000);
  const eventType = searchParams.get("eventType") ?? "all";
  const status = searchParams.get("status") ?? "all";
  const platform = searchParams.get("platform") ?? "all";

  try {
    let entries = await readOpsLog(limit);

    if (eventType !== "all") entries = entries.filter((e) => e.eventType === eventType);
    if (status !== "all") entries = entries.filter((e) => e.status === status);
    if (platform !== "all")
      entries = entries.filter((e) => e.platform.toLowerCase() === platform.toLowerCase());

    return NextResponse.json({ entries, total: entries.length });
  } catch (err) {
    console.error("[/api/activity]", err);
    return NextResponse.json({ error: "Failed to fetch activity log" }, { status: 500 });
  }
}
