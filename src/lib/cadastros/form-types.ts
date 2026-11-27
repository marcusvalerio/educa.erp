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
  /** Rótulo exibido por valor (ex.: "CN — China"); o valor salvo continua o da lista. */
  optionLabels?: Record<string, string>;
  optionsSource?: OptionsSourceKey;
  span?: 1 | 2 | 3 | 4;
  placeholder?: string;
  helpText?: string;
  min?: number;
  step?: number;
  disabledOnEdit?: boolean;
  /** Consulta assistida: "ncm" busca na tabela oficial de NCM. */
  lookup?: "ncm";
};

export type FormSection = {
  title: string;
  fields: FormField[];
};
