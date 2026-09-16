export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "yes_no"
  | "checkbox"
  | "radio"
  | "select"
  | "consent";

/** Content rules a `text` field's answer must satisfy (see validate.ts). */
export type TextFieldFormat = "email" | "phone" | "ssn" | "full_name";

export const TEXT_FIELD_FORMAT_LABELS: Record<TextFieldFormat, string> = {
  full_name: "Full name",
  email: "Email address",
  phone: "Phone number",
  ssn: "SSN (123-45-6789)",
};

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  /** Only meaningful for checkbox | radio | select. */
  options?: string[];
  helpText?: string;
  /** Only meaningful for text. */
  format?: TextFieldFormat;
}

export interface GeneratedForm {
  name: string;
  fields: FormField[];
}
