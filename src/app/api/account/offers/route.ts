import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account/auth";
import { getCustomerOffers } from "@/lib/account/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const check = await requireCustomer();
  if (!check.ok) return check.response;

  try {
    return NextResponse.json({ offers: await getCustomerOffers(check.customer) });
  } catch (err) {
    console.error("GET /api/account/offers error:", err);
    return NextResponse.json({ error: "Failed to load your offers" }, { status: 500 });
  }
}
