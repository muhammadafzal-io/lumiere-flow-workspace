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

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  /** Only meaningful for checkbox | radio | select. */
  options?: string[];
  helpText?: string;
}

export interface GeneratedForm {
  name: string;
  fields: FormField[];
}
