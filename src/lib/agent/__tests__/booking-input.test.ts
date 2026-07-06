import { describe, expect, it } from "vitest";
import { normalizeEmail } from "@/lib/email";
import {
  dateOfBirthNotPromoCodeError,
  looksLikeDateOfBirthInput,
  phoneRequiredForPromoError,
} from "@/lib/credits/promo-code-input";

describe("normalizeEmail", () => {
  it("strips spaces from spoken or typed emails", () => {
    expect(normalizeEmail("talha azeem@gmail.com")).toBe("talhaazeem@gmail.com");
    expect(normalizeEmail("  Sarah  Johnson@Gmail.COM ")).toBe("sarahjohnson@gmail.com");
  });

  it("rejects invalid emails", () => {
    expect(normalizeEmail("not-an-email")).toBeUndefined();
  });

  it("strips voice that's prefix glued to local part", () => {
    expect(normalizeEmail("that'sriaz36872@gmail.com")).toBe("riaz36872@gmail.com");
  });
});

describe("looksLikeDateOfBirthInput", () => {
  it("detects DOB answers", () => {
    expect(looksLikeDateOfBirthInput("1990-03-15")).toBe(true);
    expect(looksLikeDateOfBirthInput("March 15, 1990")).toBe(true);
    expect(looksLikeDateOfBirthInput("03/15/1990")).toBe(true);
  });

  it("does not treat promo codes as DOB", () => {
    expect(looksLikeDateOfBirthInput("BDAY-M-K8R9")).toBe(false);
    expect(looksLikeDateOfBirthInput("SAVE30")).toBe(false);
  });

  it("returns helpful error text", () => {
    expect(dateOfBirthNotPromoCodeError()).toContain("upsert_client");
  });
});

describe("validatePromoCode phone requirement", () => {
  it("documents phone-required error", () => {
    expect(phoneRequiredForPromoError()).toContain("phone");
  });
});
