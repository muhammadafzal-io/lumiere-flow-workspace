import { NextRequest, NextResponse } from "next/server";
import { listAllOfferEvents } from "@/lib/booking/offer-events";
import { summarizeOfferPerformance } from "@/lib/booking/offer-performance";
import { listAllServiceNames } from "@/lib/booking/recipe";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const check = await requireApiPermission("offer_performance", "View");
  if (!check.ok) return check.response;

  try {
    const params = req.nextUrl.searchParams;
    const daysParam = params.get("days");
    const since =
      daysParam && daysParam !== "all"
        ? new Date(Date.now() - Number(daysParam) * 24 * 60 * 60_000).toISOString()
        : undefined;

    const [events, serviceNames] = await Promise.all([
      listAllOfferEvents(since ? { since } : undefined),
      listAllServiceNames().catch(() => ({})),
    ]);

    const offers = summarizeOfferPerformance(events);

    return NextResponse.json({ ok: true, offers, serviceNames });
  } catch (err) {
    console.error("GET /api/offer-performance error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load offer performance" },
      { status: 500 },
    );
  }
}
