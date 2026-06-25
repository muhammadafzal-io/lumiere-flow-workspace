import { NextRequest, NextResponse } from "next/server";
import { runNoshowFlow } from "@/lib/retention/noshow";

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorised(req)) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const result = await runNoshowFlow({ trigger: "cron" });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
