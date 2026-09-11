import {
  fornecedoresRepository,
  locaisEstoqueRepository,
  transportadorasRepository,
  motoristasRepository,
  categoriasRepository,
  marcasRepository,
} from "./repository";

export type OptionsSourceKey =
  | "fornecedores"
  | "locais"
  | "transportadoras"
  | "motoristas"
  | "categorias"
  | "marcas";

export type SelectOption = { value: string; label: string };

export function resolveOptionsSource(key: OptionsSourceKey): SelectOption[] {
  switch (key) {
    case "fornecedores":
      return fornecedoresRepository
        .list()
        .filter((f) => f.status === "Ativo")
        .map((f) => ({ value: f.id, label: f.razaoSocial }));
    case "locais":
      return locaisEstoqueRepository
        .list()
        .filter((l) => l.status === "Ativo")
        .map((l) => ({ value: l.codigoLocal, label: l.codigoLocal }));
    case "transportadoras":
      return transportadorasRepository
        .list()
        .filter((t) => t.status === "Ativo")
        .map((t) => ({ value: t.id, label: t.razaoSocial }));
    case "motoristas":
      return motoristasRepository
        .list()
        .filter((m) => m.status === "Ativo")
        .map((m) => ({ value: m.id, label: m.nome }));
    case "categorias":
      return categoriasRepository
        .list()
        .filter((c) => c.status === "Ativo")
        .map((c) => ({ value: c.id, label: c.nome }));
    case "marcas":
      return marcasRepository
        .list()
        .filter((m) => m.status === "Ativo")
        .map((m) => ({ value: m.id, label: m.nome }));
    default:
      return [];
  }
}
