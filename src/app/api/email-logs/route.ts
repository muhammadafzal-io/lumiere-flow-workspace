import { NextRequest, NextResponse } from "next/server";
import {
  readEmailSendLog,
  type EmailSendCategory,
  type EmailSendStatus,
  type EmailSendTrigger,
} from "@/lib/integrations/email-send-log";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const check = await requireApiPermission("email_logs", "View");
  if (!check.ok) return check.response;

  try {
    const params = req.nextUrl.searchParams;
    const category = (params.get("category") ?? "all") as EmailSendCategory | "all";
    const categoriesRaw = params.get("categories");
    const categories = categoriesRaw
      ? (categoriesRaw.split(",").filter(Boolean) as EmailSendCategory[])
      : undefined;
    const status = (params.get("status") ?? "all") as EmailSendStatus | "all";
    const triggerType = (params.get("trigger") ?? "all") as EmailSendTrigger | "all";
    const search = params.get("search") ?? undefined;
    const limit = params.has("limit") ? Number(params.get("limit")) : 300;

    const { entries, stats } = await readEmailSendLog({
      category: categories?.length ? "all" : category,
      categories,
      status,
      triggerType,
      search,
      limit,
    });

    return NextResponse.json({ ok: true, entries, stats });
  } catch (err) {
    console.error("GET /api/email-logs error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load email logs" },
      { status: 500 },
    );
  }
}
