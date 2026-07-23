import { NextRequest, NextResponse } from "next/server";
import { executeTool } from "@/lib/agent";
import {
  validateBookAppointment,
  validateUpsertClientName,
  validateEscalation,
} from "@/lib/agent/booking-guards";
import {
  createVoiceFlowLogger,
  BOOKING_FLOW_TOOLS,
  summarizeForFlowLog,
} from "@/lib/voice/flow-log";
import {
  blockRescheduleToolDuringNewBooking,
  detectVoiceBookingIntent,
} from "@/lib/voice/booking-intent";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { toolName, input, platform, chatId, bookingIntent, cancelOnly } = (await req.json()) as {
    toolName: string;
    input: Record<string, unknown>;
    platform?: string;
    chatId?: string;
    bookingIntent?: "new" | "cancel_reschedule" | "unknown";
    cancelOnly?: boolean;
  };

  const sessionId = chatId ?? "voice-session";
  const flow = createVoiceFlowLogger(sessionId, "server");

  try {
    flow.step("api:received", {
      toolName,
      platform: platform ?? "voice",
      input: summarizeForFlowLog(input),
    });

    if (!toolName || typeof input !== "object") {
      flow.step("api:rejected", { reason: "missing toolName or input" });
      return NextResponse.json({ error: "toolName and input are required" }, { status: 400 });
    }

    const intent =
      bookingIntent ?? (platform === "voice" ? detectVoiceBookingIntent([]) : "unknown");
    const blocked = blockRescheduleToolDuringNewBooking(toolName, intent);
    if (blocked) {
      flow.step("api:blocked reschedule tool during new booking", {
        toolName,
        bookingIntent: intent,
      });
      return NextResponse.json({ error: blocked }, { status: 400 });
    }

    if (
      cancelOnly &&
      (toolName === "check_reschedule_availability" || toolName === "reschedule_appointment")
    ) {
      const msg =
        "Caller wants to cancel — use cancel_appointment with phone or event_id. Do not reschedule.";
      flow.step("api:blocked reschedule during cancel", { toolName, cancelOnly });
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (toolName === "book_appointment") {
      // This route only ever serves the realtime voice session — always the relaxed gate.
      const guardError = await validateBookAppointment(input, { requireFullProfile: false });
      if (guardError) {
        flow.step("api:guard blocked", { toolName, error: guardError });
        return NextResponse.json({ error: guardError }, { status: 400 });
      }
      flow.step("api:guard passed", { toolName });
    }

    if (toolName === "upsert_client") {
      const nameError = validateUpsertClientName(input.name);
      if (nameError) {
        flow.step("api:guard blocked", { toolName, error: nameError });
        return NextResponse.json({ error: nameError }, { status: 400 });
      }
      flow.step("api:guard passed", { toolName, input: summarizeForFlowLog(input) });
    }

    if (BOOKING_FLOW_TOOLS.has(toolName) && toolName !== "upsert_client") {
      flow.step("api:audit tool", { toolName, input: summarizeForFlowLog(input) });
    }

    if (toolName === "escalate_to_human") {
      const guardError = await validateEscalation(input);
      if (guardError) {
        flow.step("api:guard blocked", { toolName, error: guardError });
        return NextResponse.json({ error: guardError }, { status: 400 });
      }
      flow.step("api:guard passed", { toolName });
    }

    flow.step("api:executeTool", { toolName });
    // Platform is never client-supplied — this route only ever serves the realtime voice
    // session, and a caller sending a different value (as VoiceCall.tsx once did by mistake)
    // must not be able to silently re-enable the email/birthday gate this route just relaxed.
    const { result } = await executeTool(toolName, input, {
      platform: "voice",
      chatId: sessionId,
    });

    flow.step("api:success", { toolName, result: summarizeForFlowLog(result) });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    flow.step("api:error", { toolName, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
