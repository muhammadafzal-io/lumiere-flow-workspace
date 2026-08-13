import { NextResponse } from "next/server";
import { acceptWaitlistOffer } from "@/lib/waitlist/offers";

export const dynamic = "force-dynamic";

/** Public, unauthenticated — same as /api/forms/submit and /api/booking/complete: possession of
 * the single-use token is the credential, there's no customer login to check against. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token } = body as Record<string, unknown>;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Missing or invalid token." }, { status: 400 });
    }

    const result = await acceptWaitlistOffer(token);
    if (!result.ok) {
      const status = result.code === "not_found" ? 404 : result.code === "slot_taken" ? 409 : 410;
      return NextResponse.json({ error: result.error, code: result.code }, { status });
    }

    return NextResponse.json({ success: true, eventId: result.eventId });
  } catch (err) {
    console.error("POST /api/waitlist/accept error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
