import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const TABLE = "Equipment";

function mapRow(r: any) {
  return {
    id: r.id,
    name: r["Name"] ?? "",
    type: r["Type"] ?? "Mobile",
    homeRoom: r["HomeRoom"] ?? null,
    cleanupMinutes: r["CleanupMinutes"] ?? 0,
    status: r["Status"] ?? "Active",
    closedTimes: r["ClosedTimes"] ?? null,
    created_at: r.created_at,
  };
}

export async function GET() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from(TABLE).select("*").order("Name");
    if (error) throw new Error(error.message);
    return NextResponse.json({ equipment: (data ?? []).map(mapRow) });
  } catch (err) {
    console.error("GET /api/settings/equipment error:", err);
    return NextResponse.json({ error: "Failed to load equipment" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sb = getSupabase();
    const body = await req.json();
    const { Name, Type, HomeRoom, CleanupMinutes, Status, ClosedTimes } = body;
    if (!Name || typeof Name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const { data, error } = await sb
      .from(TABLE)
      .insert({
        Name,
        Type: Type ?? "Mobile",
        HomeRoom: HomeRoom ?? null,
        CleanupMinutes: CleanupMinutes ?? 0,
        Status: Status ?? "Active",
        ClosedTimes: ClosedTimes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ equipment: mapRow(data) });
  } catch (err) {
    console.error("POST /api/settings/equipment error:", err);
    return NextResponse.json({ error: "Failed to create equipment" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const sb = getSupabase();
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const fields: Record<string, any> = {};
    if (body.Name !== undefined) fields["Name"] = body.Name;
    if (body.Type !== undefined) fields["Type"] = body.Type;
    if (body.HomeRoom !== undefined) fields["HomeRoom"] = body.HomeRoom;
    if (body.CleanupMinutes !== undefined) fields["CleanupMinutes"] = body.CleanupMinutes;
    if (body.Status !== undefined) fields["Status"] = body.Status;
    if (body.ClosedTimes !== undefined) fields["ClosedTimes"] = body.ClosedTimes;

    const { data, error } = await sb.from(TABLE).update(fields).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ equipment: mapRow(data) });
  } catch (err) {
    console.error("PATCH /api/settings/equipment error:", err);
    return NextResponse.json({ error: "Failed to update equipment" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const sb = getSupabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/settings/equipment error:", err);
    return NextResponse.json({ error: "Failed to delete equipment" }, { status: 500 });
  }
}
