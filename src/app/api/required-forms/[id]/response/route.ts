import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";
import { getFormResponseAnswers, updateFormResponseAnswers } from "@/lib/forms/response-link";

export const dynamic = "force-dynamic";

/**
 * Staff view of a submitted in-house form's answers, and (via PATCH) staff edits to it. The
 * sibling PATCH at required-forms/[id]/complete only ever moves the tracking row's status
 * forward (SUBMITTED -> COMPLETED); it never touches the answers this route reads/writes — those
 * are two independent concerns (review lifecycle vs. content). `form_source` is kept as a
 * defensive check even though this app no longer supports any other kind of form — see
 * migrations/remove_external_forms.sql.
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireApiPermission("forms", "Update");
  if (!check.ok) return check.response;

  const { id } = await params;
  try {
    const body = await req.json();
    const { answers } = body as Record<string, unknown>;

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

    const { data: userRow } = await sb
      .from("Users")
      .select("Name")
      .eq("id", check.userId)
      .maybeSingle();

    const result = await updateFormResponseAnswers(
      row.form_response_id,
      answers && typeof answers === "object" ? (answers as Record<string, unknown>) : {},
      { id: check.userId, name: userRow?.Name ?? "Staff" },
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, errors: result.errors },
        { status: result.errors ? 422 : 400 },
      );
    }

    const response = await getFormResponseAnswers(row.form_response_id);
    return NextResponse.json(response);
  } catch (err) {
    console.error("PATCH /api/required-forms/[id]/response error:", err);
    return NextResponse.json({ error: "Failed to save changes" }, { status: 500 });
  }
}
