import { NextResponse } from "next/server";
import { findClientByAuthUser, getAccountSession, linkAccount } from "@/lib/account/auth";

export const dynamic = "force-dynamic";

/**
 * Who is signed in, and which profile they're attached to. Also performs the first link: a client
 * arriving from Google is matched to their record here, or told what's needed to claim it.
 */
export async function GET() {
  const session = await getAccountSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const linked = await findClientByAuthUser(session.authUserId);
    if (linked) {
      return NextResponse.json({
        status: "linked",
        profile: publicProfile(linked),
        session: safeSession(session),
      });
    }

    const outcome = await linkAccount(session);
    if (outcome.status === "linked") {
      return NextResponse.json({
        status: "linked",
        profile: publicProfile(outcome.customer),
        session: safeSession(session),
      });
    }
    if (outcome.status === "needs_verification") {
      return NextResponse.json({
        status: "needs_verification",
        clientId: outcome.clientId,
        hint: outcome.hint,
        session: safeSession(session),
      });
    }
    return NextResponse.json({ status: "ambiguous", session: safeSession(session) });
  } catch (err) {
    console.error("GET /api/account/me error:", err);
    return NextResponse.json({ error: "Failed to load your profile" }, { status: 500 });
  }
}

function safeSession(session: {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}) {
  return { email: session.email, name: session.name, avatarUrl: session.avatarUrl };
}

function publicProfile(customer: {
  id: string;
  name: string;
  phone: string;
  email: string;
  birthday: string;
}) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    birthday: customer.birthday,
  };
}
