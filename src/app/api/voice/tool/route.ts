import { NextRequest, NextResponse } from "next/server";
import { executeTool } from "@/lib/agent";
import { validateBookAppointment, validateUpsertClientName } from "@/lib/agent/booking-guards";

export async function POST(req: NextRequest) {
  try {
    const { toolName, input, chatId } = (await req.json()) as {
      toolName: string;
      input: Record<string, unknown>;
      chatId?: string;
    };
    if (!toolName || typeof input !== "object") {
      return NextResponse.json({ error: "toolName and input are required" }, { status: 400 });
    }

    if (toolName === "book_appointment") {
      // This route only ever serves the realtime voice session — always the relaxed gate.
      const guardError = await validateBookAppointment(input, { requireFullProfile: false });
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

    // Platform is never client-supplied — this route only ever serves the realtime voice
    // session, and a caller sending a different value (as VoiceCall.tsx once did by mistake)
    // must not be able to silently re-enable the email/birthday gate this route just relaxed.
    const { result } = await executeTool(toolName, input, {
      platform: "voice",
      chatId: chatId ?? "voice-session",
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
