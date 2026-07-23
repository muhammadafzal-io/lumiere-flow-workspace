import { NextRequest, NextResponse } from "next/server";
import { getRole, updateRole, deleteRole } from "@/lib/rbac/admin";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const check = await requireApiPermission("rbac", "View");
  if (!check.ok) return check.response;

  try {
    const { id } = await ctx.params;
    const role = await getRole(id);
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
    return NextResponse.json({ role });
  } catch (err) {
    console.error("GET /api/rbac/roles/[id] error:", err);
    return NextResponse.json({ error: "Failed to load role" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const check = await requireApiPermission("rbac", "Manage");
  if (!check.ok) return check.response;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const { name, description, permissionIds } = body as {
      name?: string;
      description?: string;
      permissionIds?: string[];
    };
    const role = await updateRole(id, { name, description, permissionIds });
    return NextResponse.json({ role });
  } catch (err) {
    console.error("PATCH /api/rbac/roles/[id] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update role" },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const check = await requireApiPermission("rbac", "Manage");
  if (!check.ok) return check.response;

  try {
    const { id } = await ctx.params;
    await deleteRole(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/rbac/roles/[id] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete role" },
      { status: 400 },
    );
  }
}
