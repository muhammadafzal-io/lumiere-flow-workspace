import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/rbac/guard";
import { userHasPermission } from "@/lib/rbac/permissions";
import {
  deleteClientNote,
  getClientNote,
  updateClientNote,
  validateNoteBody,
  type ClientNote,
} from "@/lib/customers/notes";
import { UUID_RE, notesErrorResponse } from "../shared";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; noteId: string }> };

/** Loads the note (scoped to the client in the URL, so a note id can't be reached through another
 * client's URL) and checks the caller wrote it, or may manage everyone's notes. */
async function loadOwnedNote(
  id: string,
  noteId: string,
  userId: string,
): Promise<{ note: ClientNote } | { response: NextResponse }> {
  const note = UUID_RE.test(id) && UUID_RE.test(noteId) ? await getClientNote(id, noteId) : null;
  if (!note) {
    return { response: NextResponse.json({ error: "Note not found" }, { status: 404 }) };
  }
  if (
    note.authorUserId !== userId &&
    !(await userHasPermission(userId, "client_notes", "Manage"))
  ) {
    return {
      response: NextResponse.json(
        { error: "You can only change notes you wrote." },
        { status: 403 },
      ),
    };
  }
  return { note };
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const check = await requireApiPermission("client_notes", "Update");
  if (!check.ok) return check.response;

  try {
    const { id, noteId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const valid = validateNoteBody(body.body);
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

    const owned = await loadOwnedNote(id, noteId, check.userId);
    if ("response" in owned) return owned.response;

    const note = await updateClientNote(id, noteId, valid.body);
    if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });
    return NextResponse.json({ note });
  } catch (error) {
    return notesErrorResponse(error, "PATCH /api/customers/[id]/notes/[noteId]");
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const check = await requireApiPermission("client_notes", "Delete");
  if (!check.ok) return check.response;

  try {
    const { id, noteId } = await ctx.params;
    const owned = await loadOwnedNote(id, noteId, check.userId);
    if ("response" in owned) return owned.response;

    const deleted = await deleteClientNote(id, noteId);
    if (!deleted) return NextResponse.json({ error: "Note not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return notesErrorResponse(error, "DELETE /api/customers/[id]/notes/[noteId]");
  }
}
