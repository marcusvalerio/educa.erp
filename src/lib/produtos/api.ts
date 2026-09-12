import type {
  Produto,
  Categoria,
  Marca,
  Fornecedor,
  ProdutoFornecedor,
  ProdutoPreco,
  ProdutoEmbalagem,
} from "@/lib/cadastros/types";

// Camada de acesso a dados dedicada a Produtos — busca/filtro/ordenação/
// paginação reais via querystring (search/status/sort/order/page/
// pageSize/categoryId/brandId/unit), diferente do repositório genérico
// de src/lib/cadastros/repository.ts (que hidrata tudo e filtra em
// memória — adequado para os outros 7 cadastros hoje, mas não para um
// catálogo de produtos que pode crescer). Ver relatório da Fase 2.

export type ApiEnvelope<T> =
  | { success: true; data: T; meta?: { total: number; page: number; pageSize: number } }
  | { success: false; error: { code: string; message: string } };

export class ApiRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<{ data: T; meta?: { total: number; page: number; pageSize: number } }> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!body || body.success === false) {
    const err = body && !body.success ? body.error : { code: "UNKNOWN", message: `Erro ${res.status} ao comunicar com o servidor.` };
    throw new ApiRequestError(err.code, err.message);
  }
  return { data: body.data, meta: body.meta };
}

export type ProductListParams = {
  search?: string;
  status?: "Ativo" | "Inativo";
  categoryId?: string;
  brandId?: string;
  unit?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

function toQueryString(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchProducts(params: ProductListParams) {
  const qs = toQueryString({ ...params });
  return request<Produto[]>(`/api/products${qs}`);
}

export async function fetchProduct(id: string) {
  return request<Produto>(`/api/products/${id}`);
}

export async function createProduct(data: Partial<Produto>) {
  return request<Produto>("/api/products", { method: "POST", body: JSON.stringify(data) });
}

export async function updateProduct(id: string, data: Partial<Produto>) {
  return request<Produto>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function deleteProduct(id: string) {
  return request<null>(`/api/products/${id}`, { method: "DELETE" });
}

export async function fetchCategories() {
  return request<Categoria[]>("/api/categories?status=Ativo&pageSize=500");
}

export async function fetchBrands() {
  return request<Marca[]>("/api/brands?status=Ativo&pageSize=500");
}

export async function fetchUnits() {
  return request<{ code: string; name: string }[]>("/api/units");
}

export async function fetchSuppliers() {
  return request<Fornecedor[]>("/api/suppliers?status=Ativo&pageSize=500");
}

export async function fetchProductSuppliers(productId: string) {
  return request<ProdutoFornecedor[]>(`/api/product-suppliers?productId=${productId}&pageSize=100`);
}

export async function createProductSupplier(data: Partial<ProdutoFornecedor>) {
  return request<ProdutoFornecedor>("/api/product-suppliers", { method: "POST", body: JSON.stringify(data) });
}

export async function updateProductSupplier(id: string, data: Partial<ProdutoFornecedor>) {
  return request<ProdutoFornecedor>(`/api/product-suppliers/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function deleteProductSupplier(id: string) {
  return request<null>(`/api/product-suppliers/${id}`, { method: "DELETE" });
}

export async function fetchProductPrices(productId: string) {
  return request<ProdutoPreco[]>(`/api/product-prices?productId=${productId}&pageSize=100&sort=valid_from&order=desc`);
}

export async function createProductPrice(data: Partial<ProdutoPreco>) {
  return request<ProdutoPreco>("/api/product-prices", { method: "POST", body: JSON.stringify(data) });
}

export async function fetchProductUnits(productId: string) {
  return request<ProdutoEmbalagem[]>(`/api/product-units?productId=${productId}&pageSize=100`);
}

export async function createProductUnit(data: Partial<ProdutoEmbalagem>) {
  return request<ProdutoEmbalagem>("/api/product-units", { method: "POST", body: JSON.stringify(data) });
}

export async function deleteProductUnit(id: string) {
  return request<null>(`/api/product-units/${id}`, { method: "DELETE" });
}

export type MePermissions = {
  authUserId: string;
  email: string | null;
  companies: { id: string; companyId: string; permissions: string[] }[];
};

/** Retorna null quando não há sessão — hoje é sempre o caso (sem UI de
 * login ainda, ver docs/AUTH_ARCHITECTURE.md). Quem chama trata null
 * como "sem enforcement de UI ainda" em vez de erro. */
export async function fetchMe(): Promise<MePermissions | null> {
  try {
    const { data } = await request<MePermissions>("/api/me");
    return data;
  } catch {
    return null;
  }
}
