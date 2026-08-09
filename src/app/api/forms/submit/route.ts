import { NextResponse } from "next/server";
import { submitFormResponse } from "@/lib/forms/response-link";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, answers } = body as Record<string, unknown>;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Missing or invalid token." }, { status: 400 });
    }

    const result = await submitFormResponse(
      token,
      answers && typeof answers === "object" ? (answers as Record<string, unknown>) : {},
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, errors: result.errors },
        { status: result.errors ? 422 : 410 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/forms/submit error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
