import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/rbac/guard";
import { updateWaitlistStatus, type WaitlistStatus } from "@/lib/waitlist/store";

export const dynamic = "force-dynamic";

const VALID_STATUSES: WaitlistStatus[] = ["Waiting", "Contacted", "Booked", "Cancelled"];

/** PATCH /api/waitlist/[id] — staff-driven status change (Waiting/Contacted/Booked/Cancelled). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireApiPermission("waitlist", "Update");
  if (!check.ok) return check.response;

  const { id } = await params;
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.status || !VALID_STATUSES.includes(body.status as WaitlistStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const entry = await updateWaitlistStatus(id, body.status as WaitlistStatus);
    return NextResponse.json({ entry });
  } catch (err) {
    console.error("PATCH /api/waitlist/[id] error:", err);
    return NextResponse.json({ error: "Failed to update waitlist entry" }, { status: 500 });
  }
}
