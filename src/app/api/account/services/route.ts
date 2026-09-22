import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account/auth";
import { listActiveServices } from "@/lib/booking/recipe";

export const dynamic = "force-dynamic";

/** The bookable menu, as the booking engine sees it — only what a client may book themselves. */
export async function GET() {
  const check = await requireCustomer();
  if (!check.ok) return check.response;

  try {
    const services = await listActiveServices();
    return NextResponse.json({
      services: services
        .filter((s) => s.onlineBookable)
        .map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          price: s.price,
          requiresConsultation: s.requiresConsultation,
        })),
    });
  } catch (err) {
    console.error("GET /api/account/services error:", err);
    return NextResponse.json({ error: "Failed to load treatments" }, { status: 500 });
  }
}
