/**
 * WhatsApp Cloud API provider — production swap for TelegramProvider.
 *
 * PRODUCTION SWAP GUIDE
 * ─────────────────────
 * 1. Set MESSAGING_PROVIDER=whatsapp in your env.
 * 2. Add the following env vars:
 *      WHATSAPP_PHONE_NUMBER_ID   – from Meta developer portal
 *      WHATSAPP_ACCESS_TOKEN      – permanent system-user token
 *      WHATSAPP_WEBHOOK_VERIFY_TOKEN – your own random string
 * 3. Point your Meta webhook URL to  POST /api/webhook/whatsapp
 *    (duplicate the Telegram route handler, already structured to accept any
 *     MessagingProvider — just swap the provider instance).
 * 4. That is the ONLY code change required.
 *
 * This stub keeps TypeScript happy during the demo phase and documents
 * the exact API surface so the WhatsApp implementation is a drop-in.
 */

import type { MessagingProvider } from "./types";
import type { InboundMessage, OutboundMessage } from "@/types";

interface WAMessage {
  from: string;
  id: string;
  text?: { body: string };
  interactive?: { button_reply?: { id: string; title: string } };
  type: string;
}

interface WAWebhookEntry {
  changes: Array<{
    value: {
      messages?: WAMessage[];
      contacts?: Array<{ profile: { name: string }; wa_id: string }>;
    };
  }>;
}

interface WAWebhookPayload {
  object: string;
  entry: WAWebhookEntry[];
}

export class WhatsAppProvider implements MessagingProvider {
  readonly platform = "whatsapp" as const;

  private get phoneNumberId() {
    return process.env.WHATSAPP_PHONE_NUMBER_ID!;
  }
  private get accessToken() {
    return process.env.WHATSAPP_ACCESS_TOKEN!;
  }

  async send(msg: OutboundMessage): Promise<void> {
    const body: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: msg.to,
      type: "text",
      text: { body: msg.text },
    };

    if (msg.buttons?.length) {
      body.type = "interactive";
      delete body.text;
      body.interactive = {
        type: "button",
        body: { text: msg.text },
        action: {
          buttons: msg.buttons.slice(0, 3).map((b) => ({
            type: "reply",
            reply: { id: b.callbackData, title: b.text.substring(0, 20) },
          })),
        },
      };
    }

    const res = await fetch(`https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`WhatsApp send failed: ${err}`);
    }
  }

  parseInbound(payload: unknown): InboundMessage | null {
    const data = payload as WAWebhookPayload;
    if (data.object !== "whatsapp_business_account") return null;

    const change = data.entry?.[0]?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (!message) return null;

    const text =
      message.type === "text"
        ? (message.text?.body ?? "")
        : message.type === "interactive"
          ? (message.interactive?.button_reply?.id ?? "")
          : "";

    return {
      id: message.id,
      from: message.from,
      chatId: message.from,
      text,
      platform: "whatsapp",
      callbackData:
        message.type === "interactive" ? message.interactive?.button_reply?.id : undefined,
    };
  }
}
