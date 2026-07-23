import { NextResponse } from "next/server";
import { listPermissions } from "@/lib/rbac/admin";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const check = await requireApiPermission("rbac", "View");
  if (!check.ok) return check.response;

  try {
    const permissions = await listPermissions();
    return NextResponse.json({ permissions });
  } catch (err) {
    console.error("GET /api/rbac/permissions error:", err);
    return NextResponse.json({ error: "Failed to load permissions" }, { status: 500 });
  }
}
