import { NextRequest, NextResponse } from "next/server";
import { runWaitlistOfferSweepFlow, runWaitlistExpirySweepFlow } from "@/lib/waitlist/sweep";
import { runOfferEventsNoResponseSweepFlow } from "@/lib/booking/offer-events";

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorised(req)) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    // Sequential, not parallel: this cron only runs once/day (Vercel Hobby-plan limit), so
    // there's no throughput reason to race them, and keeping them sequential makes a failure in
    // one easy to attribute without the other's errors interleaving in the response.
    const offers = await runWaitlistOfferSweepFlow();
    const expiry = await runWaitlistExpirySweepFlow();
    const offerEvents = await runOfferEventsNoResponseSweepFlow();
    return NextResponse.json({ ok: true, offers, expiry, offerEvents });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}