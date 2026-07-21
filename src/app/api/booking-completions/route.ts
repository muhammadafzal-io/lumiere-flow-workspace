import { NextResponse } from "next/server";
import { listPendingCompletions } from "@/lib/booking/completion-followups";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await listPendingCompletions();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/booking-completions error:", err);
    return NextResponse.json({ error: "Failed to load pending bookings" }, { status: 500 });
  }
}
