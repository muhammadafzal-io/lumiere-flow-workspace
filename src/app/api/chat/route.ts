import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import {
  MESSAGE_TOO_LONG_CODE,
  MESSAGE_TOO_LONG_TEXT,
  USER_MESSAGE_HARD_LIMIT_TOKENS,
  USER_MESSAGE_SOFT_LIMIT_TOKENS,
  validateUserMessageLength,
} from "@/lib/agent/message-limits";

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

  // Size check runs here — after the existing required-field validation, before runAgent() — so an
  // oversized paste never reaches OpenAI. Counts only this message; history is not included.
  const length = await validateUserMessageLength(message);
  if (length.hardExceeded) {
    console.warn("[api/chat] user message rejected", {
      sessionId,
      user_message_tokens: length.tokens,
      hard_limit: USER_MESSAGE_HARD_LIMIT_TOKENS,
      message_rejected: true,
    });
    return NextResponse.json(
      { error: MESSAGE_TOO_LONG_CODE, message: MESSAGE_TOO_LONG_TEXT },
      { status: 400 },
    );
  }
  if (length.softExceeded) {
    console.warn("[api/chat] user message over soft limit", {
      sessionId,
      user_message_tokens: length.tokens,
      soft_limit: USER_MESSAGE_SOFT_LIMIT_TOKENS,
    });
  }

  const startedAt = Date.now();
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
    // The client only ever sees the generic line below, so this log is the ONLY record that a
    // real customer conversation failed — it was previously discarded (`void err`), which made
    // every such failure invisible in production. Includes elapsed time and history length
    // because the failures worth diagnosing here are the slow ones (an upstream model timeout
    // looks completely different from an immediate throw, and only the timing distinguishes them).
    console.error("[api/chat] runAgent failed", {
      sessionId,
      elapsedMs: Date.now() - startedAt,
      historyLength: Array.isArray(history) ? history.length : 0,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { reply: "I'm having trouble right now. Please try again later." },
      { status: 200 },
    );
  }
}
