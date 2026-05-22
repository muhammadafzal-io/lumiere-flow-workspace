import type { ConversationMessages } from "@/types";

const MAX_HISTORY = 20;

const store = new Map<string, ConversationMessages>();

export function getSession(chatId: string): ConversationMessages {
  const history = store.get(chatId) ?? [];
  return history;
}

export function updateSession(chatId: string, messages: ConversationMessages): void {
  const trimmed = messages.slice(-MAX_HISTORY);
  store.set(chatId, trimmed);
}

export function clearSession(chatId: string): void {
  store.delete(chatId);
}
