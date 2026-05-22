import { NextRequest, NextResponse } from "next/server";
import { TelegramProvider } from "@/lib/messaging/telegram";
import { runAgent } from "@/lib/agent";
import { getSession, updateSession } from "@/lib/session";

const provider = new TelegramProvider();

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true;
  return req.headers.get("x-telegram-bot-api-secret-token") === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const inbound = provider.parseInbound(body);
  if (!inbound) {
    return NextResponse.json({ ok: true });
  }

  if (inbound.callbackData) {
    const callbackQueryId = inbound.id;
    await provider.answerCallbackQuery(callbackQueryId);

    const [action] = inbound.callbackData.split(":");
    if (action === "confirm") {
      await provider.send({
        to: inbound.chatId,
        text: `✅ Great, you're confirmed! We'll see you soon. If anything changes, just message us.`,
      });
      return NextResponse.json({ ok: true });
    }
  }

  const firstName = inbound.firstName ?? "";
  const lastName = inbound.lastName ?? "";
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") || inbound.username || "there";

  const history = getSession(inbound.chatId);
  let userMessage = inbound.text;

  if (history.length === 0) {
    userMessage = `[Client info: Telegram ID ${inbound.from}, display name "${displayName}", username @${inbound.username ?? "unknown"}]\n\n${inbound.text}`;
  }

  try {
    const result = await runAgent({
      userMessage,
      history,
      platform: "telegram",
      chatId: inbound.chatId,
    });

    updateSession(inbound.chatId, result.messages);

    await provider.send({ to: inbound.chatId, text: result.text, parseMode: "HTML" });
  } catch (err) {
    await provider.send({
      to: inbound.chatId,
      text: `I'm sorry, something went wrong on my end. Please try again in a moment, or contact us at hello@lumierespa.com 💛`,
    });
  }

  return NextResponse.json({ ok: true });
}

export function GET() {
  return NextResponse.json({ ok: true, service: "Lumière Telegram Webhook" });
}
