import { NextRequest, NextResponse } from "next/server";
import { getRuleFilterSuggestions } from "@/lib/rules/audience";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const field = req.nextUrl.searchParams.get("field") as
      | "status"
      | "treatment"
      | "visit_range"
      | null;
    const q = req.nextUrl.searchParams.get("q") ?? "";

    if (!field) {
      return NextResponse.json({ error: "field is required" }, { status: 400 });
    }

    const suggestions = await getRuleFilterSuggestions(field, q);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("GET /api/rule/suggestions error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
