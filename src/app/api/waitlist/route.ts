import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/rbac/guard";
import { lookupClient, upsertClient } from "@/lib/integrations/airtable";
import {
  createWaitlistEntry,
  listWaitlistEntries,
  type WaitlistStatus,
} from "@/lib/waitlist/store";

export const dynamic = "force-dynamic";

const VALID_STATUSES: WaitlistStatus[] = ["Waiting", "Contacted", "Booked", "Cancelled"];

export async function GET(req: NextRequest) {
  const check = await requireApiPermission("waitlist", "View");
  if (!check.ok) return check.response;

  const { searchParams } = req.nextUrl;
  const statusParam = searchParams.get("status");
  if (statusParam && !VALID_STATUSES.includes(statusParam as WaitlistStatus)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  try {
    const entries = await listWaitlistEntries({
      status: (statusParam as WaitlistStatus) || undefined,
    });
    return NextResponse.json({ entries });
  } catch (err) {
    console.error("GET /api/waitlist error:", err);
    return NextResponse.json({ error: "Failed to load waitlist" }, { status: 500 });
  }
}

/**
 * POST /api/waitlist
 * Body: { clientName, phone, email?, treatment, preferredDate, preferredTimeStart?,
 *         preferredTimeEnd?, preferredPractitionerName?, flexibility?, notes? }
 *
 * Manual staff entry — same underlying createWaitlistEntry (and its dedupe behavior) the AI
 * agent's add_to_waitlist tool uses, for a phone call or walk-in a human handled directly.
 */
export async function POST(req: NextRequest) {
  const check = await requireApiPermission("waitlist", "Create");
  if (!check.ok) return check.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientName = String(body.clientName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const treatment = String(body.treatment ?? "").trim();
  const preferredDate = String(body.preferredDate ?? "").trim();

  const missing: string[] = [];
  if (!clientName) missing.push("clientName");
  if (!phone) missing.push("phone");
  if (!treatment) missing.push("treatment");
  if (!preferredDate) missing.push("preferredDate");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    await upsertClient({
      name: clientName,
      phone,
      email: typeof body.email === "string" ? body.email : undefined,
    }).catch(() => undefined);
    const clientRecord = await lookupClient({ phone });
    if (!clientRecord?.id) {
      return NextResponse.json({ error: "Could not save this client record" }, { status: 500 });
    }

    const entry = await createWaitlistEntry({
      clientId: clientRecord.id,
      clientName,
      treatment,
      preferredDate,
      preferredTimeStart: (body.preferredTimeStart as string | undefined) || null,
      preferredTimeEnd: (body.preferredTimeEnd as string | undefined) || null,
      preferredPractitionerName: (body.preferredPractitionerName as string | undefined) || null,
      flexibility: (body.flexibility as string | undefined) || null,
      notes: (body.notes as string | undefined) || null,
      source: "admin",
    });
    return NextResponse.json({ entry });
  } catch (err) {
    console.error("POST /api/waitlist error:", err);
    return NextResponse.json({ error: "Failed to add to waitlist" }, { status: 500 });
  }
}
