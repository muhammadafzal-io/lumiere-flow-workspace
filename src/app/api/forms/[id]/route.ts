import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";
import { sanitizeFormFields } from "@/lib/forms/sanitize";

export const dynamic = "force-dynamic";

const FORMS = "Forms";

function mapForm(r: any) {
  return {
    id: r.id,
    name: r.name ?? "",
    description: r.description ?? "",
    fields: Array.isArray(r.fields) ? r.fields : [],
    status: r.status ?? "Active",
    sourcePrompt: r.source_prompt ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireApiPermission("forms", "View");
  if (!check.ok) return check.response;

  const { id } = await params;
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from(FORMS).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Form not found" }, { status: 404 });
    return NextResponse.json({ form: mapForm(data) });
  } catch (err) {
    console.error("GET /api/forms/[id] error:", err);
    return NextResponse.json({ error: "Failed to load form" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireApiPermission("forms", "Update");
  if (!check.ok) return check.response;

  const { id } = await params;
  try {
    const sb = getSupabase();
    const body = await req.json();
    const { name, description, fields, status } = body;

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (fields !== undefined || name !== undefined) {
      const sanitized = sanitizeFormFields({
        name: name ?? undefined,
        fields: fields ?? undefined,
      });
      if (name !== undefined) updates.name = sanitized.name;
      if (fields !== undefined) updates.fields = sanitized.fields;
    }
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;

    const { data, error } = await sb.from(FORMS).update(updates).eq("id", id).select().single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ form: mapForm(data) });
  } catch (err) {
    console.error("PATCH /api/forms/[id] error:", err);
    return NextResponse.json({ error: "Failed to update form" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireApiPermission("forms", "Delete");
  if (!check.ok) return check.response;

  const { id } = await params;
  try {
    const sb = getSupabase();
    const { error } = await sb.from(FORMS).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/forms/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete form" }, { status: 500 });
  }
}
