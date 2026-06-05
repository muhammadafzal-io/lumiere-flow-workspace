import { NextRequest, NextResponse } from "next/server";
import { getSupabase as getSupabaseClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    // Fetch all rooms from the Rooms table
    const { data, error } = await supabase.from("Rooms").select("Name").order("Name");

    if (error) {
      console.error("[/api/settings/rooms] GET error:", error);
      return NextResponse.json(
        { error: "Failed to fetch rooms", code: "FETCH_ERROR" },
        { status: 500 },
      );
    }

    // Extract room names from data
    const rooms = data?.map((r: any) => r.Name) || ["Room 1", "Room 2"];
    console.log("[/api/settings/rooms] GET success, rooms:", rooms);
    return NextResponse.json({ rooms });
  } catch (err) {
    console.error("[/api/settings/rooms] GET exception:", err);
    return NextResponse.json(
      { error: "Failed to fetch rooms", code: "FETCH_ERROR" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  // Diagnostic endpoint to check setup
  try {
    const supabase = getSupabaseClient();

    console.log("[/api/settings/rooms] Diagnostic check");

    // Check if Rooms table exists and has data
    const { data: rooms, error: roomsError } = await supabase.from("Rooms").select("*").limit(5);

    if (roomsError) {
      console.error("[Diagnostic] Error fetching rooms:", roomsError);
      return NextResponse.json({
        status: "error",
        error: roomsError.message,
        hint: roomsError.hint,
        code: roomsError.code,
      });
    }

    console.log("[Diagnostic] Rooms found:", rooms);

    return NextResponse.json({
      status: "ok",
      roomsCount: rooms?.length || 0,
      sampleRooms: rooms?.slice(0, 3),
      message: "Diagnostic data retrieved successfully",
    });
  } catch (err) {
    console.error("[Diagnostic] Exception:", err);
    return NextResponse.json({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { rooms } = body;

    if (!Array.isArray(rooms) || rooms.length === 0) {
      return NextResponse.json(
        { error: "rooms must be a non-empty array", code: "INVALID_ROOMS" },
        { status: 400 },
      );
    }

    // Validate each room is a non-empty string
    if (!rooms.every((r) => typeof r === "string" && r.trim().length > 0)) {
      return NextResponse.json(
        { error: "each room must be a non-empty string", code: "INVALID_ROOM_NAME" },
        { status: 400 },
      );
    }

    // Remove duplicates and sort
    const uniqueRooms = Array.from(new Set(rooms.map((r) => r.trim()))).sort();

    const supabase = getSupabaseClient();

    // Get existing rooms
    const { data: existingRooms, error: fetchError } = await supabase
      .from("Rooms")
      .select("id, Name");

    if (fetchError) {
      console.error("[/api/settings/rooms] PATCH fetch error:", fetchError);
      return NextResponse.json(
        {
          error: "Failed to fetch existing rooms",
          code: "FETCH_ERROR",
          details: process.env.NODE_ENV === "development" ? fetchError.message : undefined,
        },
        { status: 500 },
      );
    }

    // Find rooms to delete (in DB but not in new list)
    const roomsToDelete = existingRooms?.filter((r: any) => !uniqueRooms.includes(r.Name)) || [];

    // Find rooms to add (in new list but not in DB)
    const roomsToAdd =
      uniqueRooms.filter((name) => !existingRooms?.some((r: any) => r.Name === name)) || [];

    console.log("[/api/settings/rooms] Update plan:", {
      toAdd: roomsToAdd,
      toDelete: roomsToDelete.map((r: any) => r.id),
      total: uniqueRooms.length,
    });

    // Delete removed rooms
    if (roomsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("Rooms")
        .delete()
        .in(
          "id",
          roomsToDelete.map((r: any) => r.id),
        );

      if (deleteError) {
        console.error("[/api/settings/rooms] Delete error:", deleteError);
        return NextResponse.json(
          {
            error: "Failed to delete rooms",
            code: "DELETE_ERROR",
            details: process.env.NODE_ENV === "development" ? deleteError.message : undefined,
          },
          { status: 500 },
        );
      }
    }

    // Add new rooms
    if (roomsToAdd.length > 0) {
      const { error: insertError } = await supabase
        .from("Rooms")
        .insert(roomsToAdd.map((name) => ({ Name: name })));

      if (insertError) {
        console.error("[/api/settings/rooms] Insert error:", insertError);
        return NextResponse.json(
          {
            error: "Failed to add rooms",
            code: "INSERT_ERROR",
            details: process.env.NODE_ENV === "development" ? insertError.message : undefined,
          },
          { status: 500 },
        );
      }
    }

    console.log("[/api/settings/rooms] PATCH success, updated to:", uniqueRooms);
    return NextResponse.json({ rooms: uniqueRooms, ok: true });
  } catch (err) {
    console.error("[/api/settings/rooms] PATCH exception:", err);
    return NextResponse.json(
      { error: "Failed to update rooms", code: "ROOMS_ERROR" },
      { status: 500 },
    );
  }
}
