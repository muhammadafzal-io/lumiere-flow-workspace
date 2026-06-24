import { NextRequest, NextResponse } from "next/server";
import { getFilterSuggestions } from "@/lib/retention/audience";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const field = req.nextUrl.searchParams.get("field") as
      | "status"
      | "treatment"
      | "visit_range"
      | null;
    const q = req.nextUrl.searchParams.get("q") ?? "";

    if (!field || !["status", "treatment", "visit_range"].includes(field)) {
      return NextResponse.json({ error: "field is required" }, { status: 400 });
    }

    const suggestions = await getFilterSuggestions(field, q);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("GET /api/retention/audience/suggestions error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
