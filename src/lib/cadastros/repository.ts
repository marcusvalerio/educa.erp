import type { BaseEntity } from "./types";
import type { Produto, Cliente, Fornecedor, Transportadora, Motorista, Veiculo, Usuario, LocalEstoque } from "./types";

// Camada de repositório — Fase 2.
//
// Antes (Fase 4): cada operação lia/escrevia em memória + localStorage,
// de forma síncrona.
// Agora: cada operação chama a API do próprio Next.js (/api/<recurso>),
// que por sua vez fala com o Supabase/PostgreSQL (ver
// src/lib/database e src/app/api). A assinatura pública dos métodos é
// praticamente a mesma — list()/get() continuam síncronos, lendo de um
// cache local populado por hydrate(); create()/update()/toggleStatus()/
// remove() agora retornam Promises, já que dependem de rede. Isso evita
// reescrever CadastroPage/EntityDrawer/colunas/relatedLists, que só
// precisaram aprender a `await` essas chamadas (ver CadastroPage.tsx).

export type DeleteResult = { ok: true } | { ok: false; reason: string };

type ApiEnvelope<T> =
  | { success: true; data: T; meta?: { total: number; page: number; pageSize: number } }
  | { success: false; error: { code: string; message: string } };

async function parseEnvelope<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!body || body.success === false) {
    const message = body && !body.success ? body.error.message : `Erro ${res.status} ao comunicar com o servidor.`;
    throw new Error(message);
  }
  return body.data;
}

export type Repository<T extends BaseEntity> = {
  hydrate: () => Promise<void>;
  list: () => T[];
  get: (id: string) => T | undefined;
  create: (data: Partial<T>) => Promise<T>;
  update: (id: string, patch: Partial<T>) => Promise<T>;
  toggleStatus: (id: string) => Promise<T>;
  remove: (id: string) => Promise<DeleteResult>;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T[];
};

function createRepository<T extends BaseEntity>(resourcePath: string): Repository<T> {
  let items: T[] = [];
  let hydratePromise: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function notify() {
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  // Referência estável usada por useSyncExternalStore: só muda quando os
  // dados realmente mudam (cada mutação reatribui `items` a um novo array).
  function getSnapshot() {
    return items;
  }

  async function fetchAll(): Promise<void> {
    const res = await fetch(`/api/${resourcePath}?pageSize=500&sort=created_at&order=desc`, {
      cache: "no-store",
    });
    items = await parseEnvelope<T[]>(res);
    notify();
  }

  function hydrate(): Promise<void> {
    if (!hydratePromise) hydratePromise = fetchAll();
    return hydratePromise;
  }

  function list(): T[] {
    return [...items];
  }

  function get(id: string): T | undefined {
    return items.find((item) => item.id === id);
  }

  async function create(data: Partial<T>): Promise<T> {
    const res = await fetch(`/api/${resourcePath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const created = await parseEnvelope<T>(res);
    items = [created, ...items];
    notify();
    return created;
  }

  async function update(id: string, patch: Partial<T>): Promise<T> {
    const res = await fetch(`/api/${resourcePath}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const updated = await parseEnvelope<T>(res);
    items = items.map((item) => (item.id === id ? updated : item));
    notify();
    return updated;
  }

  async function toggleStatus(id: string): Promise<T> {
    const current = get(id);
    if (!current) throw new Error("Registro não encontrado.");
    const nextStatus = current.status === "Ativo" ? "Inativo" : "Ativo";
    return update(id, { status: nextStatus } as Partial<T>);
  }

  async function remove(id: string): Promise<DeleteResult> {
    const res = await fetch(`/api/${resourcePath}/${id}`, { method: "DELETE" });
    const body = (await res.json().catch(() => null)) as ApiEnvelope<null> | null;
    if (!body || body.success === false) {
      const message = body && !body.success ? body.error.message : `Erro ${res.status} ao excluir.`;
      return { ok: false, reason: message };
    }
    items = items.filter((item) => item.id !== id);
    notify();
    return { ok: true };
  }

  return { hydrate, list, get, create, update, toggleStatus, remove, subscribe, getSnapshot };
}

export const produtosRepository = createRepository<Produto>("products");
export const clientesRepository = createRepository<Cliente>("customers");
export const fornecedoresRepository = createRepository<Fornecedor>("suppliers");
export const transportadorasRepository = createRepository<Transportadora>("carriers");
export const motoristasRepository = createRepository<Motorista>("drivers");
export const veiculosRepository = createRepository<Veiculo>("vehicles");
export const usuariosRepository = createRepository<Usuario>("users");
export const locaisEstoqueRepository = createRepository<LocalEstoque>("warehouse-locations");

export function hydrateAllCadastros(): Promise<void[]> {
  return Promise.all([
    locaisEstoqueRepository.hydrate(),
    transportadorasRepository.hydrate(),
    fornecedoresRepository.hydrate(),
    motoristasRepository.hydrate(),
    veiculosRepository.hydrate(),
    clientesRepository.hydrate(),
    usuariosRepository.hydrate(),
    produtosRepository.hydrate(),
  ]);
}
