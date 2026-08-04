import { describe, expect, it } from "vitest";
import { formatLastVisit } from "../last-visit";

describe("formatLastVisit", () => {
  it("returns the fallback for null", () => {
    expect(formatLastVisit(null)).toBe("No visits recorded");
  });

  it("returns the fallback for undefined", () => {
    expect(formatLastVisit(undefined)).toBe("No visits recorded");
  });

  it("returns the fallback for an empty string", () => {
    expect(formatLastVisit("")).toBe("No visits recorded");
  });

  it("returns the fallback for a blank string", () => {
    expect(formatLastVisit("   ")).toBe("No visits recorded");
  });

  it("returns the fallback for an unparseable date string", () => {
    expect(formatLastVisit("not-a-date")).toBe("No visits recorded");
  });

  it("formats a valid ISO date with the default locale/options", () => {
    const result = formatLastVisit("2026-08-01T10:30:00Z");
    expect(result).not.toBe("No visits recorded");
    expect(result).not.toMatch(/invalid/i);
  });

  it("formats a valid ISO date using explicit options and locale, respecting timezone", () => {
    const result = formatLastVisit(
      "2026-08-01T10:30:00Z",
      { month: "short", day: "numeric", year: "numeric" },
      "en-US",
    );
    expect(result).toBe("Aug 1, 2026");
  });
});
