import { NextResponse } from "next/server";
import { listPendingCompletions } from "@/lib/booking/completion-followups";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const check = await requireApiPermission("pending_bookings", "View");
  if (!check.ok) return check.response;

  try {
    const items = await listPendingCompletions();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/booking-completions error:", err);
    return NextResponse.json({ error: "Failed to load pending bookings" }, { status: 500 });
  }
}
