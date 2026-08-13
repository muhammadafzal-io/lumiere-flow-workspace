import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";
import { getRequiredFormTrackingById } from "@/lib/forms/tracking";
import { getFormResponseLinkById, submitFormResponseForStaff } from "@/lib/forms/response-link";

export const dynamic = "force-dynamic";

/**
 * Staff "Fill on Behalf" flow — lets a staff member enter a client's answers themselves (e.g.
 * the client filled the form out on paper in person) instead of leaving it PENDING forever with
 * no supported path forward. See src/lib/forms/response-link.ts's submitFormResponseForStaff for
 * why this lands on SUBMITTED, not COMPLETED — a staff-entered response still goes through the
 * same review step (/api/required-forms/[id]/complete) a client's own submission would.
 */

/** Field definitions for the form behind this tracking row, so the staff dialog can render it.
 * Not gated on status === "PENDING" — harmless to view field definitions regardless; the real
 * guard against re-filling an already-submitted form lives on the POST below. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireApiPermission("forms", "View");
  if (!check.ok) return check.response;

  const { id } = await params;
  try {
    const row = await getRequiredFormTrackingById(id);
    if (!row || !row.formResponseId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const found = await getFormResponseLinkById(row.formResponseId);
    if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ formName: found.form.name, fields: found.form.fields });
  } catch (err) {
    console.error("GET /api/required-forms/[id]/fill error:", err);
    return NextResponse.json({ error: "Failed to load form" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireApiPermission("forms", "Update");
  if (!check.ok) return check.response;

  const { id } = await params;
  try {
    const body = await req.json();
    const { answers } = body as Record<string, unknown>;

    const row = await getRequiredFormTrackingById(id);
    if (!row || !row.formResponseId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (row.status !== "PENDING") {
      return NextResponse.json({ error: "This form has already been submitted." }, { status: 400 });
    }

    const sb = getSupabase();
    const { data: userRow } = await sb
      .from("Users")
      .select("Name")
      .eq("id", check.userId)
      .maybeSingle();

    const result = await submitFormResponseForStaff(
      row.formResponseId,
      answers && typeof answers === "object" ? (answers as Record<string, unknown>) : {},
      { id: check.userId, name: userRow?.Name ?? "Staff" },
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, errors: result.errors },
        { status: result.errors ? 422 : 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/required-forms/[id]/fill error:", err);
    return NextResponse.json({ error: "Failed to submit form" }, { status: 500 });
  }
}
