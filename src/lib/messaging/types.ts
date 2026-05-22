import type { InboundMessage, OutboundMessage } from "@/types";

export interface MessagingProvider {
  send(msg: OutboundMessage): Promise<void>;

  parseInbound(payload: unknown): InboundMessage | null;

  readonly platform: "telegram" | "whatsapp" | "discord" | "widget";
}
