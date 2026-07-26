/**
 * WhatsApp Cloud API provider — production swap for DiscordProvider.
 *
 * PRODUCTION SWAP GUIDE
 * ─────────────────────
 * 1. Set MESSAGING_PROVIDER=whatsapp in your env.
 * 2. Add the following env vars:
 *      WHATSAPP_PHONE_NUMBER_ID   – from Meta developer portal
 *      WHATSAPP_ACCESS_TOKEN      – permanent system-user token
 *      WHATSAPP_WEBHOOK_VERIFY_TOKEN – your own random string
 * 3. Point your Meta webhook URL to  POST /api/webhook/whatsapp
 *    (duplicate the Discord route handler at src/app/api/webhook/discord,
 *     already structured to accept any MessagingProvider — just swap the
 *     provider instance).
 * 4. That is the ONLY code change required.
 *
 * This stub keeps TypeScript happy during the demo phase and documents
 * the exact API surface so the WhatsApp implementation is a drop-in.
 */

import * as crypto from "crypto";
import type { MessagingProvider } from "./types";
import type { InboundMessage, OutboundMessage } from "@/types";
import { normalizeWhatsAppPhone } from "@/lib/phone";

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

/**
 * Verifies Meta's `X-Hub-Signature-256` header (HMAC-SHA256 of the raw body, keyed by the
 * app's App Secret) — the WhatsApp Cloud API equivalent of Discord's Ed25519 signature check.
 * Must run against the raw request body, before JSON.parse, same reason the Discord webhook
 * route reads `req.text()` first.
 */
export function verifyWhatsAppSignature(
  appSecret: string,
  signatureHeader: string,
  rawBody: string,
): boolean {
  try {
    const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const provided = signatureHeader.replace(/^sha256=/, "");
    const expectedBuf = Buffer.from(expected, "hex");
    const providedBuf = Buffer.from(provided, "hex");
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
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
      to: normalizeWhatsAppPhone(msg.to),
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

  /**
   * Sends an approved Message Template — required for any business-initiated ("cold") message,
   * since free-form text (`send()` above) only delivers within the 24h customer-service window
   * opened by the recipient's last message. `parameters` uses Meta's named-variable format
   * (`{{customer_name}}` style templates, not positional `{{1}}`), matching every template we've
   * created in WhatsApp Manager going forward.
   */
  async sendTemplate(opts: {
    to: string;
    templateName: string;
    languageCode: string;
    parameters: Record<string, string>;
  }): Promise<void> {
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizeWhatsAppPhone(opts.to),
      type: "template",
      template: {
        name: opts.templateName,
        language: { code: opts.languageCode },
        components: [
          {
            type: "body",
            parameters: Object.entries(opts.parameters).map(([parameter_name, text]) => ({
              type: "text",
              parameter_name,
              text,
            })),
          },
        ],
      },
    };

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
      throw new Error(`WhatsApp template send failed: ${err}`);
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

    // Meta includes the sender's WhatsApp display name alongside the message, keyed by
    // wa_id — match it to this specific message's sender rather than assuming index 0.
    const contact = change?.value?.contacts?.find((c) => c.wa_id === message.from);

    return {
      id: message.id,
      from: message.from,
      chatId: message.from,
      text,
      platform: "whatsapp",
      firstName: contact?.profile?.name,
      callbackData:
        message.type === "interactive" ? message.interactive?.button_reply?.id : undefined,
    };
  }
}
