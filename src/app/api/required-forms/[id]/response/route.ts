import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";
import { getFormResponseAnswers } from "@/lib/forms/response-link";

export const dynamic = "force-dynamic";

/**
 * Read-only staff view of a completed in-house form's submitted answers. Only ever a GET — there
 * is no corresponding write route, matching "staff should not be able to modify the client's
 * submitted responses." External (hosted-elsewhere) forms have no answers in this system at all,
 * so this always 400s for those; use the "Mark as completed" flow on required-forms/[id]/complete
 * instead for those.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireApiPermission("forms", "View");
  if (!check.ok) return check.response;

  const { id } = await params;
  try {
    const sb = getSupabase();
    const { data: row, error } = await sb
      .from("RequiredFormTracking")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (row.form_source !== "inhouse" || !row.form_response_id) {
      return NextResponse.json(
        { error: "This form was hosted externally — its answers aren't stored in this system." },
        { status: 400 },
      );
    }

    const response = await getFormResponseAnswers(row.form_response_id);
    if (!response) {
      return NextResponse.json({ error: "This form hasn't been submitted yet." }, { status: 404 });
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /api/required-forms/[id]/response error:", err);
    return NextResponse.json({ error: "Failed to load form response" }, { status: 500 });
  }
}
