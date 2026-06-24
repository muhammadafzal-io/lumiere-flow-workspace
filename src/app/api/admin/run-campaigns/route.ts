import { NextRequest, NextResponse } from "next/server";
import { sendAllPendingCampaignEmails } from "@/lib/campaigns/send";
import { processAllActiveCampaigns } from "@/lib/campaigns/process";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Admin-triggered: process all active campaigns then send pending emails. */
export async function POST(_req: NextRequest) {
  try {
    const processResults = await processAllActiveCampaigns();
    const sendResults = await sendAllPendingCampaignEmails();
    return NextResponse.json({
      ok: true,
      process: processResults,
      sent: sendResults.totals.sent,
      skipped: sendResults.totals.skipped,
      failed: sendResults.totals.failed,
      campaigns: sendResults.campaigns,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

/** Process only — assign recipients without sending. */
export async function GET(_req: NextRequest) {
  try {
    const processResults = await processAllActiveCampaigns();
    return NextResponse.json({ ok: true, process: processResults });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
