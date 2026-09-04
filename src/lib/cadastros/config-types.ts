import type { ColumnConfig, FilterConfig } from "@/lib/pages/types";
import type { Row } from "@/lib/mock/generators";
import type { FormSection } from "./form-types";
import type { FieldErrors } from "./validation";
import type { BaseEntity } from "./types";
import type { Repository } from "./repository";

export type RelatedGroup = {
  title: string;
  items: { label: string; sublabel?: string }[];
};

export type CadastroConfig<T extends BaseEntity> = {
  moduleLabel: string;
  moduleHref: string;
  pageLabel: string;
  title: string;
  description: string;
  primaryActionLabel: string;
  entityLabel: string;
  entityNounLower: string;
  repository: Repository<T>;
  columns: ColumnConfig[];
  filters: FilterConfig[];
  toRow: (item: T) => Row;
  formSections: FormSection[];
  validate: (data: Partial<T>, list: T[], currentId?: string) => FieldErrors;
  defaultValues: (list: T[]) => Partial<T>;
  labelOf: (item: T) => string;
  relatedLists?: (item: T) => RelatedGroup[];
};
