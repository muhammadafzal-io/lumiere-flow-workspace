import { NextRequest, NextResponse } from "next/server";
import { WhatsAppProvider, verifyWhatsAppSignature } from "@/lib/messaging/whatsapp";
import { runAgent } from "@/lib/agent";
import { getSession, updateSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // allow up to 60s for agent to respond

const provider = new WhatsAppProvider();

/** Strip the agent's light HTML and convert to WhatsApp's own markdown flavor. */
function toWhatsAppText(html: string): string {
  return html
    .replace(/<b>(.*?)<\/b>/gi, "*$1*")
    .replace(/<strong>(.*?)<\/strong>/gi, "*$1*")
    .replace(/<i>(.*?)<\/i>/gi, "_$1_")
    .replace(/<em>(.*?)<\/em>/gi, "_$1_")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .trim();
}

/**
 * Meta's one-time webhook verification handshake, sent when the webhook URL is registered
 * (or re-verified) in the Meta App Dashboard.
 */
export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "";
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  // Read raw body first — required for X-Hub-Signature-256 verification.
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (appSecret && !verifyWhatsAppSignature(appSecret, signature, rawBody)) {
    return new NextResponse("Invalid request signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Status-update callbacks (delivered/read receipts) have no messages[] — clean no-op,
  // not an error, since they come through this same endpoint.
  const inbound = provider.parseInbound(body);
  if (!inbound) {
    return NextResponse.json({ ok: true });
  }

  const history = getSession(inbound.chatId);
  let userMessage = inbound.text;

  // Inject client context on the first message in a session — the phone number is already
  // this app's canonical client identity (matches the existing phone-based cancel/reschedule
  // model), so no separate ID-mapping is needed the way Discord's snowflake IDs required.
  if (history.length === 0) {
    userMessage =
      `[Client info: WhatsApp phone ${inbound.from}${inbound.firstName ? `, name "${inbound.firstName}"` : ""}]\n\n` +
      inbound.text;
  }

  try {
    const result = await runAgent({
      userMessage,
      history,
      platform: "whatsapp",
      chatId: inbound.chatId,
    });

    updateSession(inbound.chatId, result.messages);

    let text = toWhatsAppText(result.text);
    if (result.escalated) {
      text += "\n\n📋 A team member has been notified and will follow up with you shortly.";
    }

    await provider.send({ to: inbound.chatId, text });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[whatsapp webhook] agent error:", err);
    await provider
      .send({
        to: inbound.chatId,
        text: "I'm sorry, something went wrong on my end. Please try again in a moment, or reach us at hello@lumierespa.com 💛",
      })
      .catch((sendErr) => console.error("[whatsapp webhook] fallback send failed:", sendErr));
    // Still 200 — a webhook failure makes Meta retry-storm the same inbound message.
    return NextResponse.json({ ok: true });
  }
}
