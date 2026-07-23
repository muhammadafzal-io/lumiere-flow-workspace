import { NextRequest, NextResponse } from "next/server";
import { resendCredentials, listUsers } from "@/lib/rbac/admin";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const check = await requireApiPermission("rbac", "Manage");
  if (!check.ok) return check.response;

  try {
    const { id } = await ctx.params;
    const users = await listUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await resendCredentials(id, user.email, user.name);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/rbac/users/[id]/resend error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resend credentials" },
      { status: 400 },
    );
  }
}
