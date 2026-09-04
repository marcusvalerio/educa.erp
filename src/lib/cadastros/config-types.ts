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
  // Repositórios de outros cadastros usados por toRow/relatedLists (ex.:
  // nome da transportadora dentro da listagem de motoristas). A página
  // aguarda a hidratação deles antes de considerar os dados prontos,
  // evitando "—" temporários por causa da concorrência entre requisições.
  // Tipado apenas pelo necessário (hydrate) para não colidir com a
  // variância de Repository<T> ao aceitar repositórios de tipos diferentes.
  dependsOn?: { hydrate: () => Promise<void> }[];
};
