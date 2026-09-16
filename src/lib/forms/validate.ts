import type { FormField, TextFieldFormat } from "@/lib/forms/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// At least two name parts, letters (any script) plus the punctuation real names use.
const FULL_NAME_RE = /^\p{L}[\p{L}'.-]*(?:\s+\p{L}[\p{L}'.-]*)+$/u;
const SSN_RE = /^(\d{3})-?(\d{2})-?(\d{4})$/;
const PHONE_CHARS_RE = /^\+?[\d\s().-]+$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function checkFormat(format: TextFieldFormat, value: string): string | null {
  switch (format) {
    case "email":
      return EMAIL_RE.test(value) ? null : "Enter a valid email address, e.g. name@example.com.";
    case "full_name":
      return FULL_NAME_RE.test(value) ? null : "Enter a first and last name, using letters only.";
    case "phone": {
      const digits = value.replace(/\D/g, "").length;
      return PHONE_CHARS_RE.test(value) && digits >= 10 && digits <= 15
        ? null
        : "Enter a valid phone number, including area code.";
    }
    case "ssn": {
      const m = SSN_RE.exec(value);
      // SSA never issues area 000, 666 or 900-999, group 00, or serial 0000.
      const valid =
        !!m &&
        m[1] !== "000" &&
        m[1] !== "666" &&
        !m[1].startsWith("9") &&
        m[2] !== "00" &&
        m[3] !== "0000";
      return valid ? null : "Enter a valid 9-digit SSN, e.g. 123-45-6789.";
    }
  }
}

function isRealDate(value: string): boolean {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Validates `answers` (keyed by field.id) against `fields`: required fields must be answered, and
 * any answered field must be well-formed for its type/format — an optional field is only checked
 * once it has a value. Returns field-level errors, or null if everything passes. Used both
 * client-side (instant feedback) and server-side (never trust client JS alone). */
export function validateFormAnswers(
  fields: FormField[],
  answers: Record<string, unknown>,
): Record<string, string> | null {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = answers[field.id];

    if (field.type === "checkbox") {
      if (field.required && (!Array.isArray(value) || value.length === 0)) {
        errors[field.id] = "Please select at least one option.";
      }
      continue;
    }
    if (field.type === "consent") {
      if (field.required && value !== true) {
        errors[field.id] = "You must agree to continue.";
      }
      continue;
    }

    const text = typeof value === "string" ? value.trim() : "";
    if (text === "") {
      if (field.required) errors[field.id] = "This field is required.";
      continue;
    }

    if (field.type === "number") {
      if (!Number.isFinite(Number(text))) errors[field.id] = "Enter a valid number.";
    } else if (field.type === "date") {
      if (!isRealDate(text)) errors[field.id] = "Enter a valid date.";
    } else if (field.type === "text" && field.format) {
      const formatError = checkFormat(field.format, text);
      if (formatError) errors[field.id] = formatError;
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
