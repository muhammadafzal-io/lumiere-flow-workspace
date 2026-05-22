import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { sessionId?: string; message?: string; history?: any };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sessionId, message, history = [] } = body;
  if (!sessionId || !message?.trim()) {
    return NextResponse.json({ error: "sessionId and message are required" }, { status: 400 });
  }

  try {
    const result = await runAgent({
      userMessage: message,
      history,
      platform: "widget",
      chatId: sessionId,
    });

    return NextResponse.json({
      reply: result.text,
      escalated: result.escalated,
      booked: result.booked,
      history: result.messages,
    });
  } catch (err) {
    void err;
    return NextResponse.json(
      { reply: "I'm having trouble right now. Please try again later." },
      { status: 200 },
    );
  }
}
