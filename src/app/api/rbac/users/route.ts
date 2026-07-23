import { NextResponse } from "next/server";
import { listUsers, createUser } from "@/lib/rbac/admin";
import { requireApiPermission, getCurrentUserId } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const check = await requireApiPermission("rbac", "View");
  if (!check.ok) return check.response;

  try {
    const users = await listUsers();
    return NextResponse.json({ users });
  } catch (err) {
    console.error("GET /api/rbac/users error:", err);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const check = await requireApiPermission("rbac", "Manage");
  if (!check.ok) return check.response;

  try {
    const body = await req.json();
    const { name, email, tempPassword, roleIds } = body as {
      name?: string;
      email?: string;
      tempPassword?: string;
      roleIds?: string[];
    };

    if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ error: "email is required" }, { status: 400 });
    if (!tempPassword || tempPassword.length < 8) {
      return NextResponse.json(
        { error: "tempPassword must be at least 8 characters" },
        { status: 400 },
      );
    }

    const invitedBy = await getCurrentUserId();
    const user = await createUser({
      name: name.trim(),
      email: email.trim(),
      tempPassword,
      roleIds: roleIds ?? [],
      invitedBy,
    });
    return NextResponse.json({ user });
  } catch (err) {
    console.error("POST /api/rbac/users error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create user" },
      { status: 400 },
    );
  }
}
