import { TelegramProvider } from "./telegram";
import { WhatsAppProvider } from "./whatsapp";
import { DiscordProvider } from "./discord";
import type { MessagingProvider } from "./types";

export type { MessagingProvider };

let _provider: MessagingProvider | null = null;

export function getMessagingProvider(): MessagingProvider {
  if (_provider) return _provider;

  const which = (process.env.MESSAGING_PROVIDER ?? "discord").toLowerCase();

  switch (which) {
    case "whatsapp":
      _provider = new WhatsAppProvider();
      break;
    case "telegram":
      _provider = new TelegramProvider();
      break;
    case "discord":
    default:
      _provider = new DiscordProvider();
      break;
  }

  return _provider;
}

export { TelegramProvider } from "./telegram";
export { WhatsAppProvider } from "./whatsapp";
export { DiscordProvider } from "./discord";
