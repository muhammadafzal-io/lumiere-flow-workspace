import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";
import { activeServicesThatWouldLoseAllRooms } from "@/lib/booking/recipe";

export const dynamic = "force-dynamic";

const TABLE = "Rooms";

function mapRow(r: any) {
  return {
    id: r.id,
    name: r["Name"] ?? "",
    type: r["Type"] ?? "Treatment",
    cleanupMinutes: r["CleanupMinutes"] ?? 0,
    status: r["Status"] ?? "Active",
    closedTimes: r["ClosedTimes"] ?? null,
    created_at: r.created_at,
  };
}

export async function GET() {
  const check = await requireApiPermission("settings", "View");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const { data, error } = await sb.from(TABLE).select("*").order("Name");
    if (error) throw new Error(error.message);
    return NextResponse.json({ rooms: (data ?? []).map(mapRow) });
  } catch (err) {
    console.error("GET /api/settings/rooms error:", err);
    return NextResponse.json({ error: "Failed to load rooms" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const check = await requireApiPermission("settings", "Create");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const body = await req.json();
    const { Name, Type, CleanupMinutes, Status, ClosedTimes } = body;
    if (!Name || typeof Name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (typeof CleanupMinutes === "number" && CleanupMinutes < 0) {
      return NextResponse.json({ error: "Cleanup minutes cannot be negative" }, { status: 400 });
    }
    const { data: existing } = await sb.from(TABLE).select("id").ilike("Name", Name.trim());
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: `A room named "${Name}" already exists` }, { status: 409 });
    }
    const { data, error } = await sb
      .from(TABLE)
      .insert({
        Name,
        Type: Type ?? "Treatment",
        CleanupMinutes: CleanupMinutes ?? 0,
        Status: Status ?? "Active",
        ClosedTimes: ClosedTimes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ room: mapRow(data) });
  } catch (err) {
    console.error("POST /api/settings/rooms error:", err);
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const check = await requireApiPermission("settings", "Update");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    if (typeof body.CleanupMinutes === "number" && body.CleanupMinutes < 0) {
      return NextResponse.json({ error: "Cleanup minutes cannot be negative" }, { status: 400 });
    }

    if (typeof body.Name === "string" && body.Name.trim()) {
      const { data: existing } = await sb
        .from(TABLE)
        .select("id")
        .ilike("Name", body.Name.trim())
        .neq("id", id);
      if (existing && existing.length > 0) {
        return NextResponse.json(
          { error: `A room named "${body.Name}" already exists` },
          { status: 409 },
        );
      }
    }

    if (body.Status === "Inactive" && !body.force) {
      const affected = await activeServicesThatWouldLoseAllRooms(id);
      if (affected.length > 0) {
        return NextResponse.json(
          {
            error: `Deactivating this room would leave ${affected.join(", ")} with no room to use — every other allowed room is already inactive or not eligible.`,
            affectedServices: affected,
            code: "WOULD_BREAK_ACTIVE_SERVICE",
          },
          { status: 409 },
        );
      }
    }

    const fields: Record<string, any> = {};
    if (body.Name !== undefined) fields["Name"] = body.Name;
    if (body.Type !== undefined) fields["Type"] = body.Type;
    if (body.CleanupMinutes !== undefined) fields["CleanupMinutes"] = body.CleanupMinutes;
    if (body.Status !== undefined) fields["Status"] = body.Status;
    if (body.ClosedTimes !== undefined) fields["ClosedTimes"] = body.ClosedTimes;

    const { data, error } = await sb.from(TABLE).update(fields).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ room: mapRow(data) });
  } catch (err) {
    console.error("PATCH /api/settings/rooms error:", err);
    return NextResponse.json({ error: "Failed to update room" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const check = await requireApiPermission("settings", "Delete");
  if (!check.ok) return check.response;

  try {
    const sb = getSupabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const force = searchParams.get("force") === "true";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    if (!force) {
      const affected = await activeServicesThatWouldLoseAllRooms(id);
      if (affected.length > 0) {
        return NextResponse.json(
          {
            error: `Deleting this room would leave ${affected.join(", ")} with no room to use.`,
            affectedServices: affected,
            code: "WOULD_BREAK_ACTIVE_SERVICE",
          },
          { status: 409 },
        );
      }
    }

    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/settings/rooms error:", err);
    return NextResponse.json({ error: "Failed to delete room" }, { status: 500 });
  }
}
