import { NextRequest, NextResponse } from "next/server";
import { runScheduledRules } from "@/lib/rules/run-scheduled";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Cron hook: auto-send active rules/campaigns when their schedule is due. */
export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const ruleId = searchParams.get("ruleId") ?? undefined;
  const force = searchParams.get("force") === "true";

  try {
    const result = await runScheduledRules({ ruleId, force });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("GET /api/cron/rules error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
