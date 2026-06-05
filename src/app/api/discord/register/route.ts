import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COMMANDS = [
  {
    name: "ask",
    description: "Chat with the Lumière AI assistant — book, ask questions, get info",
    options: [
      {
        name: "message",
        description: "Your message (e.g. 'I want to book a HydraFacial for next Tuesday')",
        type: 3, // STRING
        required: true,
      },
    ],
  },
];

export async function GET() {
  const appId = process.env.DISCORD_APPLICATION_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!appId || !botToken) {
    return NextResponse.json(
      { error: "Missing DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN" },
      { status: 500 },
    );
  }

  const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(COMMANDS),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json(
      { error: "Failed to register commands", details: err },
      { status: 500 },
    );
  }

  const data = await res.json();
  return NextResponse.json({ success: true, registered: data });
}
