import "server-only";

import { getSupabase } from "@/lib/supabase";
import { CLIENT_NOTES_PAGE_SIZE, type ClientNote } from "@/lib/customers/notes-shared";

export { validateNoteBody, type ClientNote } from "@/lib/customers/notes-shared";

const TABLE = "ClientNotes";

/** Thrown when the ClientNotes table hasn't been created yet (migrations/create_client_notes.sql),
 * so the API can say what's wrong instead of a generic 500. */
export class ClientNotesUnavailableError extends Error {
  constructor() {
    super("Client notes aren't set up yet — run migrations/create_client_notes.sql.");
  }
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table|does not exist/i.test(error.message ?? "")
  );
}

function fail(op: string, error: { code?: string; message?: string }): never {
  if (isMissingTable(error)) throw new ClientNotesUnavailableError();
  throw new Error(`${op}: ${error.message}`);
}

function mapNoteRow(row: any): ClientNote {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    eventId: row.event_id ?? null,
    body: row.body ?? "",
    authorUserId: row.author_user_id ?? null,
    authorName: row.author_name ?? "Staff",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

/** One page of a client's notes, newest first. `before` is the createdAt of the last note on the
 * previous page. */
export async function listClientNotes(
  clientId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<{ notes: ClientNote[]; hasMore: boolean }> {
  const limit = opts.limit ?? CLIENT_NOTES_PAGE_SIZE;
  let query = getSupabase()
    .from(TABLE)
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (opts.before) query = query.lt("created_at", opts.before);

  const { data, error } = await query;
  if (error) fail("listClientNotes", error);
  const rows = (data ?? []).map(mapNoteRow);
  return { notes: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function getClientNote(clientId: string, noteId: string): Promise<ClientNote | null> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("id", noteId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) fail("getClientNote", error);
  return data ? mapNoteRow(data) : null;
}

export async function createClientNote(input: {
  clientId: string;
  eventId?: string | null;
  body: string;
  author: { id: string; name: string };
}): Promise<ClientNote> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert({
      client_id: input.clientId,
      event_id: input.eventId || null,
      body: input.body,
      author_user_id: input.author.id,
      author_name: input.author.name,
    })
    .select("*")
    .single();
  if (error) fail("createClientNote", error);
  return mapNoteRow(data);
}

export async function updateClientNote(
  clientId: string,
  noteId: string,
  body: string,
): Promise<ClientNote | null> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ body, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("client_id", clientId)
    .select("*")
    .maybeSingle();
  if (error) fail("updateClientNote", error);
  return data ? mapNoteRow(data) : null;
}

export async function deleteClientNote(clientId: string, noteId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq("id", noteId)
    .eq("client_id", clientId)
    .select("id");
  if (error) fail("deleteClientNote", error);
  return (data ?? []).length > 0;
}
