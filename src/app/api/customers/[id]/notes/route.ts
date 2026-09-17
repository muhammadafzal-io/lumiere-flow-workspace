import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";
import { createClientNote, listClientNotes, validateNoteBody } from "@/lib/customers/notes";
import { clientExists, notesErrorResponse } from "./shared";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const check = await requireApiPermission("client_notes", "View");
  if (!check.ok) return check.response;

  try {
    const { id } = await ctx.params;
    if (!(await clientExists(id))) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    const before = req.nextUrl.searchParams.get("before") ?? undefined;
    if (before && isNaN(new Date(before).getTime())) {
      return NextResponse.json({ error: "Invalid page cursor" }, { status: 400 });
    }
    return NextResponse.json(await listClientNotes(id, { before }));
  } catch (error) {
    return notesErrorResponse(error, "GET /api/customers/[id]/notes");
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const check = await requireApiPermission("client_notes", "Create");
  if (!check.ok) return check.response;

  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const valid = validateNoteBody(body.body);
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
    if (!(await clientExists(id))) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const { data: userRow } = await getSupabase()
      .from("Users")
      .select("Name")
      .eq("id", check.userId)
      .maybeSingle();

    const note = await createClientNote({
      clientId: id,
      eventId: typeof body.eventId === "string" ? body.eventId.slice(0, 256) : null,
      body: valid.body,
      author: { id: check.userId, name: userRow?.Name ?? "Staff" },
    });
    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    return notesErrorResponse(error, "POST /api/customers/[id]/notes");
  }
}
