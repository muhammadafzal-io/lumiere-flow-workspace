import { NextResponse } from "next/server";
import { completeBookingLink } from "@/lib/booking/completion-link";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, fullName, email, birthday } = body as Record<string, unknown>;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Missing or invalid token." }, { status: 400 });
    }

    const result = await completeBookingLink(token, {
      fullName: typeof fullName === "string" ? fullName : "",
      email: typeof email === "string" ? email : "",
      birthday: typeof birthday === "string" ? birthday : "",
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, errors: result.errors },
        { status: result.errors ? 422 : 410 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/booking/complete error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
