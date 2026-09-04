import type { BaseEntity, StatusCadastro } from "./types";
import type {
  Produto,
  Cliente,
  Fornecedor,
  Transportadora,
  Motorista,
  Veiculo,
  Usuario,
  LocalEstoque,
} from "./types";
import { logAudit } from "./audit";
import {
  seedLocaisEstoque,
  seedTransportadoras,
  seedFornecedores,
  seedMotoristas,
  seedVeiculos,
  seedClientes,
  seedUsuarios,
  seedProdutos,
} from "./seed";

function nowIso() {
  return new Date().toISOString();
}

function readStorage<T>(key: string): T[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : null;
  } catch {
    return null;
  }
}

function writeStorage<T>(key: string, data: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage indisponível — os dados seguem válidos apenas em memória para esta sessão.
  }
}

function genId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export type DeleteResult = { ok: true } | { ok: false; reason: string };

export type CreateInput<T extends BaseEntity> = Omit<T, "id" | "criadoEm" | "atualizadoEm" | "status"> & {
  status?: StatusCadastro;
};

export type RepositoryConfig<T extends BaseEntity> = {
  storageKey: string;
  idPrefix: string;
  entityLabel: string;
  seed: () => T[];
  labelOf: (item: T) => string;
};

export function createRepository<T extends BaseEntity>(config: RepositoryConfig<T>) {
  let items: T[] = config.seed();
  let hydrated = false;
  let canDelete: (item: T, all: T[]) => DeleteResult = () => ({ ok: true });
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

  function persist() {
    writeStorage(config.storageKey, items);
  }

  function hydrate() {
    if (hydrated) return;
    hydrated = true;
    const stored = readStorage<T>(config.storageKey);
    if (stored && stored.length > 0) {
      items = stored;
      notify();
    } else {
      persist();
    }
  }

  function list(): T[] {
    return [...items];
  }

  function get(id: string): T | undefined {
    return items.find((item) => item.id === id);
  }

  function applyPatch(id: string, patch: Partial<T>): T | undefined {
    let updated: T | undefined;
    items = items.map((item) => {
      if (item.id !== id) return item;
      updated = { ...item, ...patch, id: item.id, atualizadoEm: nowIso() };
      return updated;
    });
    if (updated) {
      persist();
      notify();
    }
    return updated;
  }

  function create(data: CreateInput<T>, usuario = "Ana Ribeiro"): T {
    const timestamp = nowIso();
    const item = {
      ...data,
      id: genId(config.idPrefix),
      status: data.status ?? "Ativo",
      criadoEm: timestamp,
      atualizadoEm: timestamp,
    } as T;
    items = [item, ...items];
    persist();
    notify();
    logAudit(config.entityLabel, config.labelOf(item), "Criado", usuario);
    return item;
  }

  function update(id: string, patch: Partial<T>, usuario = "Ana Ribeiro"): T | undefined {
    const updated = applyPatch(id, patch);
    if (updated) logAudit(config.entityLabel, config.labelOf(updated), "Alterado", usuario);
    return updated;
  }

  function toggleStatus(id: string, usuario = "Ana Ribeiro"): T | undefined {
    const current = get(id);
    if (!current) return undefined;
    const nextStatus: StatusCadastro = current.status === "Ativo" ? "Inativo" : "Ativo";
    const updated = applyPatch(id, { status: nextStatus } as Partial<T>);
    if (updated) {
      logAudit(
        config.entityLabel,
        config.labelOf(updated),
        nextStatus === "Ativo" ? "Ativado" : "Inativado",
        usuario
      );
    }
    return updated;
  }

  function remove(id: string, usuario = "Ana Ribeiro"): DeleteResult {
    const current = get(id);
    if (!current) return { ok: false, reason: "Registro não encontrado." };
    const guard = canDelete(current, items);
    if (!guard.ok) return guard;
    items = items.filter((item) => item.id !== id);
    persist();
    notify();
    logAudit(config.entityLabel, config.labelOf(current), "Excluído", usuario);
    return { ok: true };
  }

  function setCanDelete(fn: (item: T, all: T[]) => DeleteResult) {
    canDelete = fn;
  }

  return {
    hydrate,
    list,
    get,
    create,
    update,
    toggleStatus,
    remove,
    setCanDelete,
    subscribe,
    getSnapshot,
  };
}

export type Repository<T extends BaseEntity> = ReturnType<typeof createRepository<T>>;

export const locaisEstoqueRepository = createRepository<LocalEstoque>({
  storageKey: "erp:cadastros:locais-estoque",
  idPrefix: "LOC",
  entityLabel: "Local de estoque",
  seed: () => seedLocaisEstoque(),
  labelOf: (item) => item.codigoLocal,
});

export const transportadorasRepository = createRepository<Transportadora>({
  storageKey: "erp:cadastros:transportadoras",
  idPrefix: "TRA",
  entityLabel: "Transportadora",
  seed: () => seedTransportadoras(),
  labelOf: (item) => item.razaoSocial,
});

export const fornecedoresRepository = createRepository<Fornecedor>({
  storageKey: "erp:cadastros:fornecedores",
  idPrefix: "FOR",
  entityLabel: "Fornecedor",
  seed: () => seedFornecedores(),
  labelOf: (item) => item.razaoSocial,
});

export const motoristasRepository = createRepository<Motorista>({
  storageKey: "erp:cadastros:motoristas",
  idPrefix: "MOT",
  entityLabel: "Motorista",
  seed: () => seedMotoristas(seedTransportadoras()),
  labelOf: (item) => item.nome,
});

export const veiculosRepository = createRepository<Veiculo>({
  storageKey: "erp:cadastros:veiculos",
  idPrefix: "VEI",
  entityLabel: "Veículo",
  seed: () => seedVeiculos(seedTransportadoras(), seedMotoristas(seedTransportadoras())),
  labelOf: (item) => item.placa,
});

export const clientesRepository = createRepository<Cliente>({
  storageKey: "erp:cadastros:clientes",
  idPrefix: "CLI",
  entityLabel: "Cliente",
  seed: () => seedClientes(),
  labelOf: (item) => item.nome,
});

export const usuariosRepository = createRepository<Usuario>({
  storageKey: "erp:cadastros:usuarios",
  idPrefix: "USR",
  entityLabel: "Usuário",
  seed: () => seedUsuarios(),
  labelOf: (item) => item.nome,
});

export const produtosRepository = createRepository<Produto>({
  storageKey: "erp:cadastros:produtos",
  idPrefix: "PRD",
  entityLabel: "Produto",
  seed: () => seedProdutos(seedFornecedores(), seedLocaisEstoque()),
  labelOf: (item) => item.codigo,
});

// Bloqueia exclusão física de registros já referenciados por outros
// cadastros (o próprio objetivo da Fase 4 é preparar isso antes dos
// módulos de operações existirem) — nesses casos, orienta a inativação.
fornecedoresRepository.setCanDelete((item) => {
  const vinculado = produtosRepository.list().some((p) => p.fornecedorId === item.id);
  return vinculado
    ? { ok: false, reason: "Este fornecedor está vinculado a produtos cadastrados. Utilize a inativação." }
    : { ok: true };
});

transportadorasRepository.setCanDelete((item) => {
  const temMotorista = motoristasRepository.list().some((m) => m.transportadoraId === item.id);
  const temVeiculo = veiculosRepository.list().some((v) => v.transportadoraId === item.id);
  return temMotorista || temVeiculo
    ? { ok: false, reason: "Esta transportadora possui motoristas ou veículos vinculados. Utilize a inativação." }
    : { ok: true };
});

motoristasRepository.setCanDelete((item) => {
  const temVeiculo = veiculosRepository.list().some((v) => v.motoristaPrincipalId === item.id);
  return temVeiculo
    ? { ok: false, reason: "Este motorista é o condutor principal de um veículo cadastrado. Utilize a inativação." }
    : { ok: true };
});

locaisEstoqueRepository.setCanDelete((item) => {
  const temProduto = produtosRepository.list().some((p) => p.localizacaoPadrao === item.codigoLocal);
  return temProduto
    ? { ok: false, reason: "Este local está definido como localização padrão de produtos cadastrados. Utilize a inativação." }
    : { ok: true };
});

export function hydrateAllCadastros() {
  locaisEstoqueRepository.hydrate();
  transportadorasRepository.hydrate();
  fornecedoresRepository.hydrate();
  motoristasRepository.hydrate();
  veiculosRepository.hydrate();
  clientesRepository.hydrate();
  usuariosRepository.hydrate();
  produtosRepository.hydrate();
}
