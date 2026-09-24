import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account/auth";
import {
  PersonalNotesUnavailableError,
  deletePersonalNote,
  updatePersonalNote,
  validatePersonalNote,
} from "@/lib/account/personal-notes";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function failure(err: unknown, label: string) {
  if (err instanceof PersonalNotesUnavailableError) {
    return NextResponse.json({ error: err.message, code: "NOT_SET_UP" }, { status: 503 });
  }
  console.error(`${label} error:`, err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "We couldn't do that just now." }, { status: 500 });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const check = await requireCustomer();
  if (!check.ok) return check.response;
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const valid = validatePersonalNote(body.body);
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
    // Scoped to the session's own client, so another client's note id simply isn't found.
    const note = await updatePersonalNote(check.customer.id, id, valid.body);
    if (!note) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    return NextResponse.json({ note });
  } catch (err) {
    return failure(err, "PATCH /api/account/notes/[id]");
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const check = await requireCustomer();
  if (!check.ok) return check.response;
  try {
    const { id } = await ctx.params;
    const removed = await deletePersonalNote(check.customer.id, id);
    if (!removed) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failure(err, "DELETE /api/account/notes/[id]");
  }
}
