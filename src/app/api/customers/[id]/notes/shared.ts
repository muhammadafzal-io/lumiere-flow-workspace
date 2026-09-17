import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { ClientNotesUnavailableError } from "@/lib/customers/notes";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function notesErrorResponse(error: unknown, label: string): NextResponse {
  if (error instanceof ClientNotesUnavailableError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  // Only the error itself is logged — never the note body, which may hold medical detail.
  console.error(`${label} error:`, error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
}

export async function clientExists(id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const { data, error } = await getSupabase()
    .from("Clients")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}
