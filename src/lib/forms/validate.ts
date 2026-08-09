import type { FormField } from "@/lib/forms/types";

/** Validates that every required field in `fields` has a real answer in `answers` (keyed by
 * field.id). Returns field-level errors, or null if everything required is present. Used both
 * client-side (instant feedback) and server-side (never trust client JS alone). */
export function validateFormAnswers(
  fields: FormField[],
  answers: Record<string, unknown>,
): Record<string, string> | null {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (!field.required) continue;
    const value = answers[field.id];

    if (field.type === "checkbox") {
      if (!Array.isArray(value) || value.length === 0) {
        errors[field.id] = "Please select at least one option.";
      }
    } else if (field.type === "consent") {
      if (value !== true) {
        errors[field.id] = "You must agree to continue.";
      }
    } else if (typeof value !== "string" || value.trim() === "") {
      errors[field.id] = "This field is required.";
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
