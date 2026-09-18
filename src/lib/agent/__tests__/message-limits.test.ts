import { describe, expect, it } from "vitest";
import {
  USER_MESSAGE_HARD_LIMIT_TOKENS,
  USER_MESSAGE_SOFT_LIMIT_TOKENS,
  validateUserMessageLength,
} from "../message-limits";

/** Builds a message of roughly `tokens` o200k tokens ("word " is one token). */
function messageOfTokens(tokens: number): string {
  return "word ".repeat(tokens);
}

describe("validateUserMessageLength", () => {
  it("accepts an ordinary booking message", async () => {
    const check = await validateUserMessageLength("I want to book Botox tomorrow at 3 PM.");
    expect(check.softExceeded).toBe(false);
    expect(check.hardExceeded).toBe(false);
  });

  it("accepts a message just below the soft limit", async () => {
    const check = await validateUserMessageLength(
      messageOfTokens(USER_MESSAGE_SOFT_LIMIT_TOKENS - 50),
    );
    expect(check.exact).toBe(true);
    expect(check.tokens).toBeLessThan(USER_MESSAGE_SOFT_LIMIT_TOKENS);
    expect(check.softExceeded).toBe(false);
  });

  it("flags a message over the soft limit but still allows it", async () => {
    const check = await validateUserMessageLength(
      messageOfTokens(USER_MESSAGE_SOFT_LIMIT_TOKENS + 100),
    );
    expect(check.softExceeded).toBe(true);
    expect(check.hardExceeded).toBe(false);
  });

  it("accepts a message just below the hard limit", async () => {
    const check = await validateUserMessageLength(
      messageOfTokens(USER_MESSAGE_HARD_LIMIT_TOKENS - 100),
    );
    expect(check.tokens).toBeLessThan(USER_MESSAGE_HARD_LIMIT_TOKENS);
    expect(check.hardExceeded).toBe(false);
  });

  it("rejects a message over the hard limit", async () => {
    const check = await validateUserMessageLength(
      messageOfTokens(USER_MESSAGE_HARD_LIMIT_TOKENS + 200),
    );
    expect(check.exact).toBe(true);
    expect(check.tokens).toBeGreaterThan(USER_MESSAGE_HARD_LIMIT_TOKENS);
    expect(check.hardExceeded).toBe(true);
  });

  it("keeps the existing behaviour for an empty message", async () => {
    const check = await validateUserMessageLength("");
    expect(check).toMatchObject({ tokens: 0, softExceeded: false, hardExceeded: false });
  });

  it("counts Urdu text by tokens, not characters", async () => {
    const check = await validateUserMessageLength("میں کل بوٹوکس بک کرانا چاہتا ہوں");
    expect(check.softExceeded).toBe(false);
    expect(check.hardExceeded).toBe(false);
  });

  it("counts Arabic and emoji-heavy text without mis-rejecting it", async () => {
    for (const text of ["أريد حجز موعد غدا", "💛💛💛🎉🎉 book me in please 🙏"]) {
      const check = await validateUserMessageLength(text);
      expect(check.hardExceeded).toBe(false);
    }
  });

  it("rejects non-ASCII text that really is over the limit", async () => {
    // Urdu runs to several tokens per word, so this is comfortably past the hard limit while
    // being far shorter in characters than an equivalent English message.
    const check = await validateUserMessageLength("میں کل بوٹوکس بک کرانا چاہتا ہوں ".repeat(300));
    expect(check.hardExceeded).toBe(true);
  });

  it("never reports an under-limit upper bound as an exact count", async () => {
    const check = await validateUserMessageLength("short message");
    expect(check.exact).toBe(false);
    expect(check.tokens).toBeLessThanOrEqual(USER_MESSAGE_SOFT_LIMIT_TOKENS);
  });
});
