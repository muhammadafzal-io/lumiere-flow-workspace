import { NextRequest, NextResponse } from "next/server";
import { getAccountSession, verifyAndLink } from "@/lib/account/auth";

export const dynamic = "force-dynamic";

/**
 * Claims an existing client record that already holds visit history, once the person proves a
 * detail on file. Without this step a mistyped email on a staff-entered record would be enough to
 * reach someone else's appointment history and photos.
 */
export async function POST(req: NextRequest) {
  const session = await getAccountSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const clientId = typeof body.clientId === "string" ? body.clientId : "";
    if (!clientId) return NextResponse.json({ error: "Missing profile" }, { status: 400 });

    const result = await verifyAndLink(session, clientId, {
      phoneLast4: typeof body.phoneLast4 === "string" ? body.phoneLast4 : undefined,
      birthday: typeof body.birthday === "string" ? body.birthday : undefined,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ status: "linked" });
  } catch (err) {
    console.error("POST /api/account/link error:", err);
    return NextResponse.json({ error: "We couldn't connect that profile" }, { status: 500 });
  }
}
