import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/rbac/guard";
import { getSupabase } from "@/lib/supabase";
import { getClinicConfig } from "@/lib/clinic-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from("Users")
    .select("id,Name,Email,MustChangePassword,Status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load user" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "User record not found" }, { status: 404 });
  }

  const { clinicName } = await getClinicConfig();

  return NextResponse.json({
    user: {
      id: data.id,
      name: data.Name,
      email: data.Email,
      mustChangePassword: data.MustChangePassword,
      status: data.Status,
    },
    clinicName,
  });
}
