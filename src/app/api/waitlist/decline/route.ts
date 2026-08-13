import { NextResponse } from "next/server";
import { declineWaitlistOffer } from "@/lib/waitlist/offers";

export const dynamic = "force-dynamic";

/** Public, unauthenticated — same reasoning as /api/waitlist/accept. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token } = body as Record<string, unknown>;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Missing or invalid token." }, { status: 400 });
    }

    const result = await declineWaitlistOffer(token);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 410 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/waitlist/decline error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
