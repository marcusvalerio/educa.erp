import {
  fornecedoresRepository,
  locaisEstoqueRepository,
  transportadorasRepository,
  motoristasRepository,
  categoriasProdutoRepository,
  marcasProdutoRepository,
  unidadesMedidaRepository,
} from "./repository";

export type OptionsSourceKey =
  | "fornecedores"
  | "locais"
  | "transportadoras"
  | "motoristas"
  | "categorias-produto"
  | "marcas-produto"
  | "unidades-medida";

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
    case "categorias-produto":
      return categoriasProdutoRepository
        .list()
        .filter((c) => c.status === "Ativo")
        .map((c) => ({
          value: c.id,
          label: c.categoriaPaiId
            ? `${categoriasProdutoRepository.get(c.categoriaPaiId)?.nome ?? "—"} / ${c.nome}`
            : c.nome,
        }));
    case "marcas-produto":
      return marcasProdutoRepository
        .list()
        .filter((m) => m.status === "Ativo")
        .map((m) => ({ value: m.id, label: m.nome }));
    case "unidades-medida":
      return unidadesMedidaRepository
        .list()
        .filter((u) => u.status === "Ativo")
        .map((u) => ({ value: u.id, label: `${u.codigo} — ${u.nome}` }));
    default:
      return [];
  }
}
