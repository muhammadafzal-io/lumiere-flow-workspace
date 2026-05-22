import type { MessagingProvider } from "./types";
import type { InboundMessage, OutboundMessage } from "@/types";

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export class TelegramProvider implements MessagingProvider {
  readonly platform = "telegram" as const;

  private get token() {
    return process.env.TELEGRAM_BOT_TOKEN!;
  }

  private apiUrl(method: string) {
    return `https://api.telegram.org/bot${this.token}/${method}`;
  }

  async send(msg: OutboundMessage): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: msg.to,
      text: msg.text,
      parse_mode: msg.parseMode ?? "HTML",
    };

    if (msg.buttons?.length) {
      body.reply_markup = {
        inline_keyboard: [
          msg.buttons.map((b) => ({ text: b.text, callback_data: b.callbackData })),
        ],
      };
    }

    const res = await fetch(this.apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telegram sendMessage failed: ${err}`);
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await fetch(this.apiUrl("answerCallbackQuery"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  }

  parseInbound(payload: unknown): InboundMessage | null {
    const update = payload as TelegramUpdate;

    if (update.message) {
      const msg = update.message;
      if (!msg.from || !msg.text) return null;

      return {
        id: String(update.update_id),
        from: String(msg.from.id),
        chatId: String(msg.chat.id),
        text: msg.text,
        platform: "telegram",
        firstName: msg.from.first_name,
        lastName: msg.from.last_name,
        username: msg.from.username,
      };
    }

    if (update.callback_query) {
      const cq = update.callback_query;
      return {
        id: cq.id,
        from: String(cq.from.id),
        chatId: String(cq.message?.chat.id ?? cq.from.id),
        text: cq.data ?? "",
        platform: "telegram",
        callbackData: cq.data,
        firstName: cq.from.first_name,
        lastName: cq.from.last_name,
        username: cq.from.username,
      };
    }

    return null;
  }
}
