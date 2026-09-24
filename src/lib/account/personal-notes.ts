import { getSupabase } from "@/lib/supabase";

/**
 * A client's own notes (migrations/create_client_personal_notes.sql). Every function is scoped to a
 * client id that comes from the signed-in session, never from the request — so a client can only
 * ever read or change their own rows. Staff notes live in a different table and never appear here.
 */

const TABLE = "ClientPersonalNotes";
export const PERSONAL_NOTE_MAX = 2000;

export interface PersonalNote {
  id: string;
  body: string;
  eventId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export class PersonalNotesUnavailableError extends Error {
  constructor() {
    super("Personal notes aren't set up yet — run migrations/create_client_personal_notes.sql.");
  }
}

function fail(op: string, error: { code?: string; message?: string }): never {
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table|does not exist/i.test(error.message ?? "")
  ) {
    throw new PersonalNotesUnavailableError();
  }
  throw new Error(`${op}: ${error.message}`);
}

function map(row: Record<string, unknown>): PersonalNote {
  return {
    id: String(row.id),
    body: String(row.body ?? ""),
    eventId: (row.event_id as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

export function validatePersonalNote(
  raw: unknown,
): { ok: true; body: string } | { ok: false; error: string } {
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!body) return { ok: false, error: "Write something first." };
  if (body.length > PERSONAL_NOTE_MAX) {
    return { ok: false, error: `Notes can be up to ${PERSONAL_NOTE_MAX} characters.` };
  }
  return { ok: true, body };
}

export async function listPersonalNotes(clientId: string): Promise<PersonalNote[]> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) fail("listPersonalNotes", error);
  return (data ?? []).map(map);
}

export async function createPersonalNote(
  clientId: string,
  body: string,
  eventId?: string | null,
): Promise<PersonalNote> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert({ client_id: clientId, body, event_id: eventId || null })
    .select("*")
    .single();
  if (error) fail("createPersonalNote", error);
  return map(data);
}

export async function updatePersonalNote(
  clientId: string,
  noteId: string,
  body: string,
): Promise<PersonalNote | null> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ body, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("client_id", clientId)
    .select("*")
    .maybeSingle();
  if (error) fail("updatePersonalNote", error);
  return data ? map(data) : null;
}

export async function deletePersonalNote(clientId: string, noteId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq("id", noteId)
    .eq("client_id", clientId)
    .select("id");
  if (error) fail("deletePersonalNote", error);
  return (data ?? []).length > 0;
}
