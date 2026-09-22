import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account/auth";
import { getSupabase } from "@/lib/supabase";
import { normalizeBirthdayForStorage } from "@/lib/birthday";
import { normalizeEmail } from "@/lib/agent/booking-guards";
import { isFullName } from "@/lib/agent/client-name";

export const dynamic = "force-dynamic";

export async function GET() {
  const check = await requireCustomer();
  if (!check.ok) return check.response;

  // Re-resolved on every request (requireCustomer reads the Clients row fresh each call, and the
  // route is force-dynamic) — a change staff make, or one the client makes from another device,
  // shows up the next time this loads rather than waiting on a cache to expire.
  const { customer } = check;
  return NextResponse.json(
    {
      profile: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        birthday: customer.birthday,
        // Real fields already on the client's own record, not previously surfaced here — the
        // admin profile lets staff edit both, so the client can now do the same for themselves.
        treatmentInterest: customer.treatments.join(", "),
        clientSince: customer.created_at ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * The client editing their own details: name, phone, birthday and treatment interest.
 *
 * Email is NOT editable here — it is the identity this account was matched on, so letting it be
 * rewritten from inside the portal would let someone point their session at a different person's
 * record. Changing it stays a staff action.
 */
export async function PATCH(req: NextRequest) {
  const check = await requireCustomer();
  if (!check.ok) return check.response;

  try {
    const body = await req.json().catch(() => ({}));
    const fields: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!isFullName(name)) {
        return NextResponse.json(
          { error: "Please give your first and last name." },
          { status: 400 },
        );
      }
      fields["Name"] = name;
    }

    if (typeof body.phone === "string") {
      const digits = body.phone.replace(/\D/g, "");
      if (digits.length < 7) {
        return NextResponse.json({ error: "That phone number looks incomplete." }, { status: 400 });
      }
      fields["Phone"] = body.phone.trim();
    }

    if (typeof body.birthday === "string" && body.birthday.trim()) {
      const birthday = normalizeBirthdayForStorage(body.birthday);
      if (!birthday) {
        return NextResponse.json(
          { error: "Please give your birthday as YYYY-MM-DD." },
          { status: 400 },
        );
      }
      fields["Birthday"] = birthday;
    }

    if (body.email !== undefined && normalizeEmail(body.email) !== check.customer.email) {
      return NextResponse.json(
        { error: "Contact the clinic to change the email on your account." },
        { status: 400 },
      );
    }

    if (typeof body.treatmentInterest === "string") {
      // Same field, same free-text convention the admin customer profile already uses.
      fields["Treatment Interest"] = body.treatmentInterest.trim();
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    // Scoped to the resolved customer's own row.
    const { error } = await getSupabase()
      .from("Clients")
      .update(fields)
      .eq("id", check.customer.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/account/profile error:", err);
    return NextResponse.json({ error: "We couldn't save that" }, { status: 500 });
  }
}
