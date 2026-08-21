import { NextResponse } from "next/server";
import { acceptOfferEvent } from "@/lib/booking/offer-response";

export const dynamic = "force-dynamic";

/** Public, unauthenticated — same as /api/waitlist/accept, /api/forms/submit, and
 * /api/booking/complete: possession of the single-use token is the credential. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token } = body as Record<string, unknown>;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Missing or invalid token." }, { status: 400 });
    }

    const result = await acceptOfferEvent(token);
    if (!result.ok) {
      const status = result.code === "not_found" ? 404 : result.code === "unavailable" ? 409 : 410;
      return NextResponse.json({ error: result.error, code: result.code }, { status });
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (err) {
    console.error("POST /api/offers/accept error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
