import { describe, expect, it } from "vitest";
import { isValidHttpUrl, normalizeFormLinks } from "@/lib/settings/service-form-links";

describe("isValidHttpUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isValidHttpUrl("http://example.com/form")).toBe(true);
    expect(isValidHttpUrl("https://forms.example.com/consent?x=1")).toBe(true);
  });

  it("rejects non-http(s) protocols", () => {
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("ftp://example.com/file")).toBe(false);
    expect(isValidHttpUrl("mailto:a@b.com")).toBe(false);
  });

  it("rejects malformed strings", () => {
    expect(isValidHttpUrl("not-a-url")).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
  });
});

describe("normalizeFormLinks", () => {
  it("trims label and url", () => {
    expect(normalizeFormLinks([{ label: "  Consent  ", url: "  https://x.com/f  " }])).toEqual([
      { label: "Consent", url: "https://x.com/f", sort_order: 0 },
    ]);
  });

  it("defaults a blank label to Form N by position", () => {
    expect(
      normalizeFormLinks([{ label: "", url: "https://x.com/a" }, { url: "https://x.com/b" }]),
    ).toEqual([
      { label: "Form 1", url: "https://x.com/a", sort_order: 0 },
      { label: "Form 2", url: "https://x.com/b", sort_order: 1 },
    ]);
  });

  it("drops rows with an empty or missing url", () => {
    expect(
      normalizeFormLinks([
        { label: "Keep", url: "https://x.com/keep" },
        { label: "Drop me", url: "   " },
        { label: "Drop me too" },
      ]),
    ).toEqual([{ label: "Keep", url: "https://x.com/keep", sort_order: 0 }]);
  });

  it("re-numbers sort_order after dropping empty rows", () => {
    expect(
      normalizeFormLinks([
        { label: "A", url: "" },
        { label: "B", url: "https://x.com/b" },
        { label: "C", url: "https://x.com/c" },
      ]),
    ).toEqual([
      { label: "B", url: "https://x.com/b", sort_order: 0 },
      { label: "C", url: "https://x.com/c", sort_order: 1 },
    ]);
  });
});
