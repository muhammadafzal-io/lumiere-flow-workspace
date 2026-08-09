import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";
import { sanitizeFormFields } from "@/lib/forms/sanitize";

export const dynamic = "force-dynamic";

const FORMS = "Forms";
const ASSIGNMENTS = "ServiceFormAssignments";

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

export async function GET() {
  const check = await requireApiPermission("forms", "View");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const { data, error } = await sb.from(FORMS).select("*").order("name");
    if (error) throw new Error(error.message);

    const forms = data ?? [];
    const ids = forms.map((f: any) => f.id);

    const { data: assignments } = await sb
      .from(ASSIGNMENTS)
      .select("*")
      .in("form_id", ids.length ? ids : ["invalid"]);

    const counts: Record<string, number> = {};
    (assignments ?? []).forEach((a: any) => {
      counts[a.form_id] = (counts[a.form_id] ?? 0) + 1;
    });

    const payload = forms.map((f: any) => ({
      ...mapForm(f),
      attachedServiceCount: counts[f.id] ?? 0,
    }));
    return NextResponse.json({ forms: payload });
  } catch (err) {
    console.error("GET /api/forms error:", err);
    return NextResponse.json({ error: "Failed to load forms" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const check = await requireApiPermission("forms", "Create");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const body = await req.json();
    const { name, description, fields, sourcePrompt } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const sanitized = sanitizeFormFields({ name, fields });

    const { data, error } = await sb
      .from(FORMS)
      .insert({
        name: sanitized.name,
        description: typeof description === "string" ? description : null,
        fields: sanitized.fields,
        status: "Active",
        source_prompt: typeof sourcePrompt === "string" ? sourcePrompt : null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ form: { ...mapForm(data), attachedServiceCount: 0 } });
  } catch (err) {
    console.error("POST /api/forms error:", err);
    return NextResponse.json({ error: "Failed to create form" }, { status: 500 });
  }
}
