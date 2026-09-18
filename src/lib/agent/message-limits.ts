/**
 * Size guard for a single incoming user message, applied at the API edge BEFORE runAgent() and
 * therefore before any OpenAI call. An accidental paste of a whole document would otherwise be
 * sent to the model — billed, and counted against the account's per-minute token budget — on
 * every tool round of that turn.
 *
 * Deliberately scoped to the current user message only: conversation history is a separate
 * concern and is not counted here.
 */

/** Logged as a warning; the message is still processed normally. */
export const USER_MESSAGE_SOFT_LIMIT_TOKENS = 300;
/** Rejected before the agent runs. */
export const USER_MESSAGE_HARD_LIMIT_TOKENS = 600;

/** Stable code for clients to branch on, alongside the human-readable `message`. */
export const MESSAGE_TOO_LONG_CODE = "MESSAGE_TOO_LONG";
export const MESSAGE_TOO_LONG_TEXT =
  "Your message is too long. Please send a shorter message with only the information needed for your request.";

export interface UserMessageLengthCheck {
  /** Exact token count, or — when `exact` is false — an upper bound that is already under both limits. */
  tokens: number;
  exact: boolean;
  softExceeded: boolean;
  hardExceeded: boolean;
}

/**
 * A token is at least one byte in any BPE encoding, so a message whose UTF-8 length is already
 * under the soft limit cannot exceed either limit. That lets ordinary chat messages (tens of
 * bytes) skip the tokenizer entirely, which keeps the tokenizer's ~3.6 MB table off the hot path
 * and out of cold starts — it is only loaded for messages big enough to actually be at risk.
 */
function isCertainlyUnderLimits(message: string): boolean {
  return Buffer.byteLength(message, "utf8") <= USER_MESSAGE_SOFT_LIMIT_TOKENS;
}

/**
 * Counts the message with the same encoding gpt-4o bills (o200k), so the count is correct for
 * Urdu, Arabic, emoji and any other non-ASCII text, where character counts are badly wrong in
 * both directions.
 */
async function countTokens(message: string): Promise<number> {
  console.debug("[api/chat] counting tokens for user message", { message_length: message.length });
  const { encode } = await import("gpt-tokenizer/encoding/o200k_base");
  return encode(message).length;
}

export async function validateUserMessageLength(message: string): Promise<UserMessageLengthCheck> {
  if (isCertainlyUnderLimits(message)) {
    return {
      tokens: Buffer.byteLength(message, "utf8"),
      exact: false,
      softExceeded: false,
      hardExceeded: false,
    };
  }

  const tokens = await countTokens(message);
  return {
    tokens,
    exact: true,
    softExceeded: tokens > USER_MESSAGE_SOFT_LIMIT_TOKENS,
    hardExceeded: tokens > USER_MESSAGE_HARD_LIMIT_TOKENS,
  };
}
