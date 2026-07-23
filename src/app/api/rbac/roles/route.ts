import { NextResponse } from "next/server";
import { listRoles, createRole } from "@/lib/rbac/admin";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const check = await requireApiPermission("rbac", "View");
  if (!check.ok) return check.response;

  try {
    const roles = await listRoles();
    return NextResponse.json({ roles });
  } catch (err) {
    console.error("GET /api/rbac/roles error:", err);
    return NextResponse.json({ error: "Failed to load roles" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const check = await requireApiPermission("rbac", "Manage");
  if (!check.ok) return check.response;

  try {
    const body = await req.json();
    const { name, description } = body as { name?: string; description?: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const role = await createRole(name.trim(), description?.trim() ?? "");
    return NextResponse.json({ role });
  } catch (err) {
    console.error("POST /api/rbac/roles error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create role" },
      { status: 500 },
    );
  }
}
