import { describe, expect, it } from "vitest";
import { formatRequiredFormsLines } from "@/lib/booking/recipe";

describe("formatRequiredFormsLines", () => {
  it("returns an empty array when there are no form links", () => {
    expect(formatRequiredFormsLines([])).toEqual([]);
  });

  it("renders a single link as a blank line, header, then label: url", () => {
    expect(
      formatRequiredFormsLines([
        { id: "1", label: "Consent Form", url: "https://forms.example.com/consent" },
      ]),
    ).toEqual([
      "",
      "Required forms — please complete before your visit:",
      "Consent Form: https://forms.example.com/consent",
    ]);
  });

  it("renders one line per link, in input order", () => {
    expect(
      formatRequiredFormsLines([
        { id: "1", label: "Consent Form", url: "https://forms.example.com/consent" },
        { id: "2", label: "Medical History", url: "https://forms.example.com/history" },
      ]),
    ).toEqual([
      "",
      "Required forms — please complete before your visit:",
      "Consent Form: https://forms.example.com/consent",
      "Medical History: https://forms.example.com/history",
    ]);
  });
});
