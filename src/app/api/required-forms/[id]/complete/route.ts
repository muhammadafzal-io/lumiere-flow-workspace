import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

/**
 * Staff approval step: moves a required form from SUBMITTED to COMPLETED after a staff member
 * has actually reviewed the customer's response (see /api/required-forms/[id]/response for the
 * read-only view they review it in). Never lets staff mark a form complete before the customer
 * has submitted anything — a form can only reach COMPLETED by way of SUBMITTED, never directly
 * from PENDING.
 */
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireApiPermission("forms", "Update");
  if (!check.ok) return check.response;

  const { id } = await params;
  try {
    const sb = getSupabase();
    const { data: row, error: fetchError } = await sb
      .from("RequiredFormTracking")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (row.status === "PENDING") {
      return NextResponse.json(
        { error: "This form hasn't been submitted yet — nothing to approve." },
        { status: 400 },
      );
    }

    if (row.status === "COMPLETED") {
      return NextResponse.json({ ok: true });
    }

    const { error } = await sb
      .from("RequiredFormTracking")
      .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/required-forms/[id]/complete error:", err);
    return NextResponse.json({ error: "Failed to update form status" }, { status: 500 });
  }
}
