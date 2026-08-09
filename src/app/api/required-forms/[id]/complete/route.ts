import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

/**
 * Manual staff completion for an externally-hosted required form — there is no webhook from an
 * arbitrary hosted-form provider (Google Forms etc.) telling us when a client finishes one, so
 * staff mark it done themselves. In-house forms complete automatically via the client's real
 * submission (see src/lib/forms/response-link.ts's submitFormResponse) and can never be flipped
 * through this route.
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

    if (row.form_source !== "external") {
      return NextResponse.json(
        { error: "Only externally-hosted forms can be marked complete manually." },
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
