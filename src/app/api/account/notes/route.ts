import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account/auth";
import {
  PersonalNotesUnavailableError,
  createPersonalNote,
  listPersonalNotes,
  validatePersonalNote,
} from "@/lib/account/personal-notes";

export const dynamic = "force-dynamic";

function failure(err: unknown, label: string) {
  if (err instanceof PersonalNotesUnavailableError) {
    return NextResponse.json({ error: err.message, code: "NOT_SET_UP" }, { status: 503 });
  }
  // Only the error is logged — never a note's text.
  console.error(`${label} error:`, err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "We couldn't do that just now." }, { status: 500 });
}

export async function GET() {
  const check = await requireCustomer();
  if (!check.ok) return check.response;
  try {
    return NextResponse.json({ notes: await listPersonalNotes(check.customer.id) });
  } catch (err) {
    return failure(err, "GET /api/account/notes");
  }
}

export async function POST(req: NextRequest) {
  const check = await requireCustomer();
  if (!check.ok) return check.response;
  try {
    const body = await req.json().catch(() => ({}));
    const valid = validatePersonalNote(body.body);
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
    const note = await createPersonalNote(
      check.customer.id,
      valid.body,
      typeof body.eventId === "string" ? body.eventId.slice(0, 256) : null,
    );
    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    return failure(err, "POST /api/account/notes");
  }
}
