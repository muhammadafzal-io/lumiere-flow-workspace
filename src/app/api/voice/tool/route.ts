import { NextRequest, NextResponse } from "next/server";
import { executeTool } from "@/lib/agent";
import { validateBookAppointment, validateUpsertClientName } from "@/lib/agent/booking-guards";

export async function POST(req: NextRequest) {
  try {
    const { toolName, input, platform, chatId } = (await req.json()) as {
      toolName: string;
      input: Record<string, unknown>;
      platform?: string;
      chatId?: string;
    };
    if (!toolName || typeof input !== "object") {
      return NextResponse.json({ error: "toolName and input are required" }, { status: 400 });
    }

    if (toolName === "book_appointment") {
      const guardError = await validateBookAppointment(input);
      if (guardError) {
        return NextResponse.json({ error: guardError }, { status: 400 });
      }
    }

    if (toolName === "upsert_client") {
      const nameError = validateUpsertClientName(input.name);
      if (nameError) {
        return NextResponse.json({ error: nameError }, { status: 400 });
      }
    }

    const { result } = await executeTool(toolName, input, {
      platform: platform ?? "widget",
      chatId: chatId ?? "voice-session",
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
