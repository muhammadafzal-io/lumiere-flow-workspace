import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/rbac/guard";
import { lookupClient, upsertClient } from "@/lib/integrations/airtable";
import {
  createWaitlistEntry,
  listWaitlistEntries,
  type WaitlistStatus,
} from "@/lib/waitlist/store";
import { listLatestOffersForWaitlistIds } from "@/lib/waitlist/matching";

export const dynamic = "force-dynamic";

const VALID_STATUSES: WaitlistStatus[] = ["Waiting", "Contacted", "Booked", "Cancelled", "Expired"];

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
    const latestOffers = await listLatestOffersForWaitlistIds(entries.map((e) => e.id));
    const entriesWithOffer = entries.map((e) => {
      const offer = latestOffers.get(e.id);
      // Same lazy-expiry computation as the customer-facing accept page — a still-"pending"
      // row past its expires_at hasn't been swept yet, but staff shouldn't see it as live.
      const isLazilyExpired =
        offer?.status === "pending" && new Date(offer.expiresAt).getTime() < Date.now();
      return {
        ...e,
        latestOffer: offer
          ? { status: isLazilyExpired ? "expired" : offer.status, expiresAt: offer.expiresAt }
          : null,
      };
    });
    return NextResponse.json({ entries: entriesWithOffer });
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
    const message = err instanceof Error ? err.message : "Failed to add to waitlist";
    // createWaitlistEntry throws this exact message when MAX_WAITLIST_PER_SLOT is hit — a real
    // conflict (409), not a server error, so the staff UI's toast reads as "list is full" rather
    // than "something broke."
    if (message.includes("waitlist is already full")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("POST /api/waitlist error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
