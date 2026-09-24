import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account/auth";
import { getCustomerTimeline } from "@/lib/account/timeline";

export const dynamic = "force-dynamic";

/** The signed-in client's own timeline — scoped to the customer the session resolved to, never an
 * id from the request. */
export async function GET() {
  const check = await requireCustomer();
  if (!check.ok) return check.response;
  try {
    return NextResponse.json(await getCustomerTimeline(check.customer), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("GET /api/account/timeline error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "We couldn't load your timeline." }, { status: 500 });
  }
}
