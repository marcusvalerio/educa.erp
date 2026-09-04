import type { OptionsSourceKey } from "./options-source";

export type FormFieldType =
  | "text"
  | "email"
  | "tel"
  | "number"
  | "select"
  | "textarea"
  | "checkbox"
  | "date";

export type FormField = {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: readonly string[];
  optionsSource?: OptionsSourceKey;
  span?: 1 | 2 | 3 | 4;
  placeholder?: string;
  helpText?: string;
  min?: number;
  step?: number;
  disabledOnEdit?: boolean;
};

export type FormSection = {
  title: string;
  fields: FormField[];
};
