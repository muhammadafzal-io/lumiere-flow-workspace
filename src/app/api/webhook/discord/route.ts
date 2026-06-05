import { NextRequest, NextResponse } from "next/server";
import { DiscordProvider, verifyDiscordSignature } from "@/lib/messaging/discord";
import { runAgent } from "@/lib/agent";
import { getSession, updateSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // allow up to 60s for agent to respond

const provider = new DiscordProvider();

/** Strip HTML tags and convert basic HTML to Discord markdown */
function toDiscordMarkdown(html: string): string {
  return html
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<i>(.*?)<\/i>/gi, "*$1*")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function discordResponse(content: string, components?: unknown[]) {
  const data: Record<string, unknown> = {
    content: content.slice(0, 2000), // Discord message limit
  };
  if (components?.length) data.components = components;
  return NextResponse.json({ type: 4, data });
}

export async function POST(req: NextRequest) {
  // Read raw body — required for Ed25519 signature verification
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  const publicKey = process.env.DISCORD_PUBLIC_KEY ?? "";

  // Verify Discord's signature before processing anything
  if (publicKey && !verifyDiscordSignature(publicKey, signature, timestamp, rawBody)) {
    return new NextResponse("Invalid request signature", { status: 401 });
  }

  const body = JSON.parse(rawBody) as {
    type: number;
    id: string;
    token: string;
    data?: { custom_id?: string; options?: { name: string; value: string }[] };
    member?: { user?: { id: string; username: string; global_name?: string } };
    user?: { id: string; username: string; global_name?: string };
  };

  // Type 1 = PING — Discord verifies the endpoint by sending this first
  if (body.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // Type 3 = MESSAGE_COMPONENT (button click)
  if (body.type === 3) {
    const customId = body.data?.custom_id ?? "";
    const [action] = customId.split(":");

    if (action === "confirm") {
      return NextResponse.json({
        type: 7, // UPDATE_MESSAGE — edits the original message
        data: {
          content:
            "✅ You're all confirmed! We'll see you soon. Message us anytime if you need to make changes. 💛",
          components: [],
        },
      });
    }

    // Other button callbacks → run through agent
  }

  // Type 2 = APPLICATION_COMMAND (slash command) | Type 3 fallthrough
  const inbound = provider.parseInbound(body);
  if (!inbound) {
    return NextResponse.json({ type: 1 });
  }

  const user = body.member?.user ?? body.user;
  const displayName = user?.global_name ?? user?.username ?? "there";

  const history = getSession(inbound.chatId);
  let userMessage = inbound.text;

  // Inject client context on first message in a session
  if (history.length === 0) {
    userMessage =
      `[Client info: Discord ID ${inbound.from}, display name "${displayName}"]\n\n` + inbound.text;
  }

  try {
    const result = await runAgent({
      userMessage,
      history,
      platform: "discord",
      chatId: inbound.chatId,
    });

    updateSession(inbound.chatId, result.messages);

    let content = toDiscordMarkdown(result.text);

    if (result.escalated) {
      content += "\n\n> 📋 A team member has been notified and will follow up with you shortly.";
    }

    return discordResponse(content);
  } catch (err) {
    console.error("[discord webhook] agent error:", err);
    return discordResponse(
      "I'm sorry, something went wrong on my end. Please try again in a moment, or reach us at hello@lumierespa.com 💛",
    );
  }
}

export function GET() {
  return NextResponse.json({ ok: true, service: "Lumière Discord Webhook" });
}
