import { describe, expect, it } from "vitest";
import { MAX_SIGNATURE_CHARS, validateSignature } from "../signature";

const PREFIX = "data:image/png;base64,";
/** A stand-in for a real drawn signature: valid base64, comfortably over the "something was drawn" floor. */
const drawn = (chars = 5_000) => PREFIX + "A".repeat(chars);

describe("validateSignature", () => {
  it("accepts a drawn signature", () => {
    const signature = drawn();
    expect(validateSignature(signature)).toEqual({ ok: true, signature });
  });

  it("asks for a signature when nothing was drawn", () => {
    for (const raw of ["", "   ", undefined, null, 42]) {
      const result = validateSignature(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Please sign to approve.");
    }
  });

  it("rejects an all-but-empty canvas", () => {
    // A blank PNG export is tiny; a real signature is tens of KB.
    expect(validateSignature(PREFIX + "A".repeat(50)).ok).toBe(false);
  });

  it("rejects anything that is not a PNG data URL", () => {
    for (const raw of [
      "data:image/svg+xml;base64," + "A".repeat(5_000),
      "data:image/jpeg;base64," + "A".repeat(5_000),
      "https://example.com/signature.png",
      "<script>alert(1)</script>".padEnd(5_000, "x"),
    ]) {
      expect(validateSignature(raw).ok, raw.slice(0, 24)).toBe(false);
    }
  });

  it("rejects a payload that is not really base64", () => {
    expect(validateSignature(PREFIX + "!!!!".repeat(1_000)).ok).toBe(false);
  });

  it("rejects something far too large to be a signature", () => {
    const result = validateSignature(PREFIX + "A".repeat(MAX_SIGNATURE_CHARS + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/);
  });

  it("trims surrounding whitespace", () => {
    const signature = drawn();
    expect(validateSignature(`  ${signature}  `)).toEqual({ ok: true, signature });
  });
});
