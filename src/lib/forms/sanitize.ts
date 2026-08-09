import type { FormField, FormFieldType, GeneratedForm } from "@/lib/forms/types";

const VALID_FIELD_TYPES: FormFieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "yes_no",
  "checkbox",
  "radio",
  "select",
  "consent",
];

const CHOICE_TYPES: FormFieldType[] = ["checkbox", "radio", "select"];

const MAX_FIELDS = 30;
const MAX_OPTIONS = 20;
const MAX_LABEL_LENGTH = 300;
const MAX_HELP_TEXT_LENGTH = 300;
const MAX_OPTION_LENGTH = 120;
const MAX_NAME_LENGTH = 120;

function sanitizeOne(raw: unknown): FormField {
  const f = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  console.log("Sanitizing form field:", f);
  const type: FormFieldType = VALID_FIELD_TYPES.includes(f.type as FormFieldType)
    ? (f.type as FormFieldType)
    : "text";

  const label = String(f.label ?? "Untitled question")
    .trim()
    .slice(0, MAX_LABEL_LENGTH);

  const required = !!f.required;

  const helpTextRaw = typeof f.helpText === "string" ? f.helpText.trim() : "";
  const helpText = helpTextRaw ? helpTextRaw.slice(0, MAX_HELP_TEXT_LENGTH) : undefined;

  let finalType = type;
  let options: string[] | undefined;

  if (CHOICE_TYPES.includes(type)) {
    const rawOptions = Array.isArray(f.options) ? f.options : [];
    console.log("Raw options:", rawOptions);
    const cleaned = rawOptions
      .map((o) => (typeof o === "string" ? o.trim().slice(0, MAX_OPTION_LENGTH) : ""))
      .filter((o) => o.length > 0)
      .slice(0, MAX_OPTIONS);
    // A choice-type field with no valid options is never persisted — demote to plain text rather
    // than shipping an unusable radio/select/checkbox group with nothing to choose from.
    if (cleaned.length === 0) {
      finalType = "text";
    } else {
      options = cleaned;
    }
  }

  return {
    id: crypto.randomUUID(),
    type: finalType,
    label,
    required,
    ...(options ? { options } : {}),
    ...(helpText ? { helpText } : {}),
  };
}

/**
 * Defensively coerces AI-returned (or otherwise untrusted) form JSON into a valid GeneratedForm —
 * never throws, always repairs into something safe to render/persist. Mirrors sanitizeRule's
 * philosophy in src/lib/rules/ai.ts.
 */
export function sanitizeFormFields(parsed: { name?: unknown; fields?: unknown }): GeneratedForm {
  const name = String(parsed.name ?? "New form")
    .trim()
    .slice(0, MAX_NAME_LENGTH);

  const rawFields = Array.isArray(parsed.fields) ? parsed.fields : [];
  const fields = rawFields
    .filter((f) => f && typeof f === "object")
    .slice(0, MAX_FIELDS)
    .map(sanitizeOne);

  return { name: name || "New form", fields };
}
