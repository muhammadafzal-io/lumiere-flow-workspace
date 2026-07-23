import { NextRequest, NextResponse } from "next/server";
import { buildAudience } from "@/lib/retention/audience";
import {
  filtersForFlow,
  parseFiltersFromSearchParams,
  type RetentionFlowKey,
} from "@/lib/retention/audience-config";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

const FLOWS: RetentionFlowKey[] = ["birthday", "reminders", "noshow", "reactivation", "followup"];

export async function GET(req: NextRequest) {
  const check = await requireApiPermission("flows", "View");
  if (!check.ok) return check.response;

  try {
    const { searchParams } = req.nextUrl;
    const flow = searchParams.get("flow") as RetentionFlowKey | null;

    if (!flow || !FLOWS.includes(flow)) {
      return NextResponse.json(
        { error: "flow is required (birthday|reminders|noshow|reactivation|followup)" },
        { status: 400 },
      );
    }

    const filters = parseFiltersFromSearchParams(flow, searchParams);
    const audience = await buildAudience(flow, filters);

    return NextResponse.json({
      ...audience,
      filters,
      filterFields: filtersForFlow(flow),
    });
  } catch (error) {
    console.error("GET /api/retention/audience error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
