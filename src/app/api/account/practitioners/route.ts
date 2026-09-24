import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account/auth";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * The active team, with the service IDs each person is qualified for — what the booking form needs
 * to offer only the treatments a chosen practitioner can actually perform, the same rule the admin
 * "New appointment" form applies. Names and qualifications only: no email, calendar ID or hours.
 */
export async function GET() {
  const check = await requireCustomer();
  if (!check.ok) return check.response;

  try {
    const { data, error } = await getSupabase()
      .from("Practitioners")
      .select("*")
      .eq("Status", "Active")
      .order("Name");
    if (error) throw new Error(error.message);
    return NextResponse.json({
      practitioners: (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ""),
        name: String(r["Name"] ?? "").trim(),
        color: (r["Color"] as string) ?? "#6366f1",
        qualifications: Array.isArray(r["Qualifications"]) ? (r["Qualifications"] as string[]) : [],
      })),
    });
  } catch (err) {
    console.error("GET /api/account/practitioners error:", err);
    return NextResponse.json({ error: "Failed to load the team" }, { status: 500 });
  }
}
