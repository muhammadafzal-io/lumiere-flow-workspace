import { describe, expect, it } from "vitest";
import { phonesMatch, phonesMatchAny } from "../phone";

describe("phonesMatch", () => {
  it("matches identical digit strings", () => {
    expect(phonesMatch("5551234567", "5551234567")).toBe(true);
  });

  it("matches across +1 / leading-1 / no-prefix formatting", () => {
    expect(phonesMatch("+15551234567", "5551234567")).toBe(true);
    expect(phonesMatch("15551234567", "+1 555 123 4567")).toBe(true);
    expect(phonesMatch("(555) 123-4567", "5551234567")).toBe(true);
  });

  it("does not match two unrelated numbers that merely share a digit run", () => {
    // "1234567" appears inside "9123456780" as a substring, but these are different phone
    // numbers — a loose "contains" check would incorrectly treat them as the same client.
    expect(phonesMatch("9123456780", "1234567")).toBe(false);
    expect(phonesMatch("5551234567", "5559999999")).toBe(false);
  });

  it("does not match a short local-only fragment against an unrelated full number", () => {
    // Two different clients in different area codes can share the same 7-digit local number —
    // this must never be treated as the same client.
    expect(phonesMatch("2125551234", "5551234")).toBe(false);
  });

  it("rejects empty or too-short input", () => {
    expect(phonesMatch("", "5551234567")).toBe(false);
    expect(phonesMatch("5551234567", "")).toBe(false);
    expect(phonesMatch("5551234567", "123")).toBe(false);
  });
});

describe("phonesMatchAny", () => {
  it("matches if any candidate matches", () => {
    expect(phonesMatchAny("+15551234567", "0000000000", "5551234567")).toBe(true);
  });

  it("returns false when no candidate matches", () => {
    expect(phonesMatchAny("+15551234567", "0000000000", "1112223333")).toBe(false);
  });
});
