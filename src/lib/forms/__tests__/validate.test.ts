import { describe, expect, it } from "vitest";
import { validateFormAnswers } from "@/lib/forms/validate";
import type { FormField } from "@/lib/forms/types";

function field(overrides: Partial<FormField>): FormField {
  return { id: "f1", type: "text", label: "Q", required: true, ...overrides };
}

describe("validateFormAnswers", () => {
  it("returns null when there are no required fields", () => {
    expect(validateFormAnswers([field({ required: false })], {})).toBeNull();
  });

  it("flags a missing text answer", () => {
    const errors = validateFormAnswers([field({ type: "text" })], {});
    expect(errors).toEqual({ f1: "This field is required." });
  });

  it("flags a blank/whitespace-only text answer", () => {
    const errors = validateFormAnswers([field({ type: "text" })], { f1: "   " });
    expect(errors).toEqual({ f1: "This field is required." });
  });

  it("accepts a non-empty text answer", () => {
    expect(validateFormAnswers([field({ type: "text" })], { f1: "hello" })).toBeNull();
  });

  it("flags a missing textarea/number/date answer the same way as text", () => {
    for (const type of ["textarea", "number", "date"] as const) {
      const errors = validateFormAnswers([field({ type })], {});
      expect(errors).toEqual({ f1: "This field is required." });
    }
  });

  it("flags a missing yes_no/radio/select answer", () => {
    for (const type of ["yes_no", "radio", "select"] as const) {
      const errors = validateFormAnswers([field({ type })], {});
      expect(errors).toEqual({ f1: "This field is required." });
    }
  });

  it("requires a non-empty array for checkbox", () => {
    expect(validateFormAnswers([field({ type: "checkbox" })], { f1: [] })).toEqual({
      f1: "Please select at least one option.",
    });
    expect(validateFormAnswers([field({ type: "checkbox" })], {})).toEqual({
      f1: "Please select at least one option.",
    });
  });

  it("accepts a non-empty array for checkbox", () => {
    expect(validateFormAnswers([field({ type: "checkbox" })], { f1: ["a"] })).toBeNull();
  });

  it("requires consent to be exactly true", () => {
    expect(validateFormAnswers([field({ type: "consent" })], { f1: false })).toEqual({
      f1: "You must agree to continue.",
    });
    expect(validateFormAnswers([field({ type: "consent" })], { f1: "true" })).toEqual({
      f1: "You must agree to continue.",
    });
    expect(validateFormAnswers([field({ type: "consent" })], { f1: true })).toBeNull();
  });

  it("collects errors across multiple fields", () => {
    const fields = [field({ id: "a", type: "text" }), field({ id: "b", type: "consent" })];
    const errors = validateFormAnswers(fields, {});
    expect(errors).toEqual({
      a: "This field is required.",
      b: "You must agree to continue.",
    });
  });
});
