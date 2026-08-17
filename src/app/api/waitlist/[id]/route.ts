import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/rbac/guard";
import {
  updateWaitlistStatus,
  updateWaitlistEntry,
  deleteWaitlistEntry,
  type WaitlistStatus,
  type UpdateWaitlistEntryInput,
} from "@/lib/waitlist/store";

export const dynamic = "force-dynamic";

const VALID_STATUSES: WaitlistStatus[] = ["Waiting", "Contacted", "Booked", "Cancelled", "Expired"];

/**
 * PATCH /api/waitlist/[id] — two distinct operations depending on the body:
 * - `{ status }` — staff-driven status change (unchanged from before).
 * - any of treatment/preferredDate/preferredTimeStart/preferredTimeEnd/
 *   preferredPractitionerName/flexibility/notes — edits the entry's preferences via
 *   updateWaitlistEntry, which re-checks the per-slot cap if treatment/date actually change.
 * A body can't mix the two — the client-facing edit dialog only ever sends edit fields, the
 * status dropdown only ever sends `status`.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireApiPermission("waitlist", "Update");
  if (!check.ok) return check.response;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as WaitlistStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    try {
      const entry = await updateWaitlistStatus(id, body.status as WaitlistStatus);
      return NextResponse.json({ entry });
    } catch (err) {
      console.error("PATCH /api/waitlist/[id] (status) error:", err);
      return NextResponse.json({ error: "Failed to update waitlist entry" }, { status: 500 });
    }
  }

  const input: UpdateWaitlistEntryInput = {};
  if (typeof body.treatment === "string") input.treatment = body.treatment.trim();
  if (typeof body.preferredDate === "string") input.preferredDate = body.preferredDate;
  if ("preferredTimeStart" in body) {
    input.preferredTimeStart = (body.preferredTimeStart as string | null) || null;
  }
  if ("preferredTimeEnd" in body) {
    input.preferredTimeEnd = (body.preferredTimeEnd as string | null) || null;
  }
  if ("preferredPractitionerName" in body) {
    input.preferredPractitionerName = (body.preferredPractitionerName as string | null) || null;
  }
  if ("flexibility" in body) input.flexibility = (body.flexibility as string | null) || null;
  if ("notes" in body) input.notes = (body.notes as string | null) || null;

  if (Object.keys(input).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  try {
    const entry = await updateWaitlistEntry(id, input);
    return NextResponse.json({ entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update waitlist entry";
    const status = message.includes("waitlist is already full")
      ? 409
      : message === "Waitlist entry not found"
        ? 404
        : 500;
    if (status === 500) console.error("PATCH /api/waitlist/[id] (edit) error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}

/** DELETE /api/waitlist/[id] — permanently removes an entry (mistaken/duplicate sign-up, or
 * staff clearing clutter). Distinct from any status change: this row (and any WaitlistOffers
 * referencing it) is gone for good. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireApiPermission("waitlist", "Delete");
  if (!check.ok) return check.response;

  const { id } = await params;
  try {
    await deleteWaitlistEntry(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/waitlist/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete waitlist entry" }, { status: 500 });
  }
}
