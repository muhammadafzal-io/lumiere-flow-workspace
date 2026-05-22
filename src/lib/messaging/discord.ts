import * as crypto from "crypto";
import type { MessagingProvider } from "./types";
import type { InboundMessage, OutboundMessage } from "@/types";

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string;
}

interface DiscordInteractionData {
  id: string;
  name: string;
  options?: Array<{ name: string; value: string; type: number }>;
  custom_id?: string;
}

export interface DiscordInteraction {
  id: string;
  type: number;
  token: string;
  application_id: string;
  channel_id?: string;
  data?: DiscordInteractionData;
  member?: { user?: DiscordUser };
  user?: DiscordUser;
}

export function verifyDiscordSignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  rawBody: string,
): boolean {
  try {
    const DER_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
    const rawKeyBuffer = Buffer.from(publicKey, "hex");
    const derPublicKey = Buffer.concat([DER_PREFIX, rawKeyBuffer]);

    const key = crypto.createPublicKey({ key: derPublicKey, format: "der", type: "spki" });
    return crypto.verify(
      null,
      Buffer.from(timestamp + rawBody),
      key,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

function buildDiscordBody(msg: OutboundMessage): Record<string, unknown> {
  const body: Record<string, unknown> = { content: msg.text };

  if (msg.buttons?.length) {
    body.components = [
      {
        type: 1,
        components: msg.buttons.slice(0, 5).map((b) => ({
          type: 2,
          label: b.text.substring(0, 80),
          custom_id: b.callbackData.substring(0, 100),
          style: 1,
        })),
      },
    ];
  }

  return body;
}

export class DiscordProvider implements MessagingProvider {
  readonly platform = "discord" as const;

  private get appId() {
    return process.env.DISCORD_APPLICATION_ID!;
  }
  private get botToken() {
    return process.env.DISCORD_BOT_TOKEN!;
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Discord snowflake user IDs are 17-20 digit numbers.
    // Interaction tokens are long alphanumeric strings that expire after 15 minutes.
    // Retention flows pass a stored user ID, not a fresh interaction token, so we
    // must open a DM channel and send via the Bot API instead.
    if (/^\d{17,20}$/.test(msg.to)) {
      await this.sendDm(msg);
      return;
    }

    // Phone number or email — cannot deliver via Discord at all
    if (/^\+?[\d\s\-(). ]{7,}$/.test(msg.to) || msg.to.includes("@")) {
      throw new Error(
        `No Discord ID for this client (contact is "${msg.to}"). ` +
          `Add their Discord user ID to the Telegram ID field in Airtable, or switch MESSAGING_PROVIDER to whatsapp.`,
      );
    }

    // Fresh interaction token — use the webhook followup endpoint.
    const body = buildDiscordBody(msg);

    const res = await fetch(`https://discord.com/api/v10/webhooks/${this.appId}/${msg.to}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Discord follow-up failed: ${err}`);
    }
  }

  private async sendDm(msg: OutboundMessage): Promise<void> {
    const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${this.botToken}`,
      },
      body: JSON.stringify({ recipient_id: msg.to }),
    });

    if (!dmRes.ok) {
      const err = await dmRes.text();
      throw new Error(`Discord DM channel creation failed: ${err}`);
    }

    const dmChannel = (await dmRes.json()) as { id: string };
    await this.sendToChannel(dmChannel.id, msg);
  }

  async sendToChannel(channelId: string, msg: OutboundMessage): Promise<void> {
    const body = buildDiscordBody(msg);

    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${this.botToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Discord channel message failed: ${err}`);
    }
  }

  parseInbound(payload: unknown): InboundMessage | null {
    const interaction = payload as DiscordInteraction;
    const user = interaction.member?.user ?? interaction.user;

    if (interaction.type === 2) {
      const text = interaction.data?.options?.find((o) => o.name === "message")?.value ?? "";
      if (!text) return null;

      return {
        id: interaction.id,
        from: user?.id ?? interaction.id,
        chatId: interaction.token,
        text,
        platform: "discord",
        firstName: user?.global_name ?? user?.username,
      };
    }

    if (interaction.type === 3) {
      const customId = interaction.data?.custom_id ?? "";
      return {
        id: interaction.id,
        from: user?.id ?? interaction.id,
        chatId: interaction.token,
        text: customId,
        platform: "discord",
        callbackData: customId,
        firstName: user?.global_name ?? user?.username,
      };
    }

    return null;
  }
}
