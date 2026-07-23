import { NextRequest, NextResponse } from "next/server";
import { updateUserRoles, setUserStatus, listUsers } from "@/lib/rbac/admin";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const check = await requireApiPermission("rbac", "Manage");
  if (!check.ok) return check.response;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const { roleIds, status } = body as {
      roleIds?: string[];
      status?: "Active" | "Disabled";
    };

    if (roleIds !== undefined) await updateUserRoles(id, roleIds);
    if (status !== undefined) await setUserStatus(id, status);

    const users = await listUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch (err) {
    console.error("PATCH /api/rbac/users/[id] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update user" },
      { status: 400 },
    );
  }
}
