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

  describe("text formats", () => {
    const check = (format: FormField["format"], value: string) =>
      validateFormAnswers([field({ format })], { f1: value });

    it.each(["Jane Doe", "Mary-Ann O'Neil", "José García López"])("accepts full name %s", (v) => {
      expect(check("full_name", v)).toBeNull();
    });
    it.each(["asda", "Jane", "Jane 123", "J@ne Doe"])("rejects full name %s", (v) => {
      expect(check("full_name", v)?.f1).toMatch(/first and last name/);
    });

    it.each(["jane@example.com", "a.b+tag@clinic.co.uk"])("accepts email %s", (v) => {
      expect(check("email", v)).toBeNull();
    });
    it.each(["adsa", "jane@", "jane@example", "jane doe@example.com"])("rejects email %s", (v) => {
      expect(check("email", v)?.f1).toMatch(/valid email/);
    });

    it.each(["+17726672772", "(772) 667-2772", "772-667-2772", "+44 20 7946 0958"])(
      "accepts phone %s",
      (v) => {
        expect(check("phone", v)).toBeNull();
      },
    );
    it.each(["adsa", "12345", "772-667-277a", "+1234567890123456"])("rejects phone %s", (v) => {
      expect(check("phone", v)?.f1).toMatch(/valid phone/);
    });

    it.each(["123-45-6789", "123456789"])("accepts SSN %s", (v) => {
      expect(check("ssn", v)).toBeNull();
    });
    it.each([
      "asad",
      "12-345-6789",
      "000-12-3456",
      "666-12-3456",
      "900-12-3456",
      "123-00-4567",
      "123-45-0000",
    ])("rejects SSN %s", (v) => {
      expect(check("ssn", v)?.f1).toMatch(/valid 9-digit SSN/);
    });

    it("trims before checking", () => {
      expect(check("email", "  jane@example.com  ")).toBeNull();
    });

    it("ignores format on non-text types", () => {
      expect(
        validateFormAnswers([field({ type: "textarea", format: "email" })], { f1: "anything" }),
      ).toBeNull();
    });
  });

  it("checks an optional field's format only once it has a value", () => {
    const f = field({ required: false, format: "email" });
    expect(validateFormAnswers([f], {})).toBeNull();
    expect(validateFormAnswers([f], { f1: "  " })).toBeNull();
    expect(validateFormAnswers([f], { f1: "nope" })?.f1).toMatch(/valid email/);
  });

  it("rejects non-numeric number answers", () => {
    expect(validateFormAnswers([field({ type: "number" })], { f1: "abc" })).toEqual({
      f1: "Enter a valid number.",
    });
    expect(validateFormAnswers([field({ type: "number" })], { f1: "42" })).toBeNull();
  });

  it("rejects impossible or malformed dates", () => {
    const date = field({ type: "date" });
    expect(validateFormAnswers([date], { f1: "2026-02-30" })?.f1).toBe("Enter a valid date.");
    expect(validateFormAnswers([date], { f1: "15/09/2026" })?.f1).toBe("Enter a valid date.");
    expect(validateFormAnswers([date], { f1: "2024-02-29" })).toBeNull();
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
