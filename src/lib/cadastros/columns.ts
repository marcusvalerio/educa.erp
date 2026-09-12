import type { ColumnConfig, FilterConfig } from "@/lib/pages/types";
import type { Row } from "@/lib/mock/generators";
import type {
  Cliente,
  Fornecedor,
  Transportadora,
  Motorista,
  Veiculo,
  Usuario,
  LocalEstoque,
} from "./types";
import {
  transportadorasRepository,
  motoristasRepository,
} from "./repository";
import {
  TIPOS_PESSOA,
  CATEGORIAS_FORNECIMENTO,
  TIPOS_TRANSPORTE,
  CATEGORIAS_CNH,
  TIPOS_VEICULO,
  PERFIS_USUARIO_CADASTRO,
  TIPOS_LOCAL_ESTOQUE,
  ARMAZENS,
  STATUS_OPTIONS,
} from "./constants";

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

export function cnhDiasRestantes(validadeCnh: string): number {
  if (!validadeCnh) return Infinity;
  const diff = new Date(validadeCnh).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function cnhAlertaTexto(validadeCnh: string): string {
  const dias = cnhDiasRestantes(validadeCnh);
  const formatted = date(validadeCnh);
  if (dias < 0) return `⚠ ${formatted} (vencida)`;
  if (dias <= 30) return `⚠ ${formatted} (a vencer)`;
  return formatted;
}

// PRODUTOS — colunas/filtros/toRow para o padrão genérico de cadastro
// foram removidos na Fase 2 (ver src/components/produtos/ProdutosPage.tsx,
// que monta suas próprias colunas com categoria/marca resolvidas via
// lookup real em vez do texto legado/constantes hardcoded que existiam
// aqui).

// CLIENTES
export const clienteColumns: ColumnConfig[] = [
  { key: "codigo", label: "Código" },
  { key: "cliente", label: "Cliente" },
  { key: "documento", label: "CPF/CNPJ" },
  { key: "cidadeUf", label: "Cidade/UF" },
  { key: "telefone", label: "Telefone" },
  { key: "limiteCredito", label: "Limite de crédito", align: "right" },
  { key: "status", label: "Status", render: "status" },
];

export const clienteFilters: FilterConfig[] = [
  { key: "cliente", label: "Cliente", type: "text" },
  { key: "documento", label: "CPF/CNPJ", type: "text" },
  { key: "tipo", label: "Tipo", type: "select", options: [...TIPOS_PESSOA] },
  { key: "status", label: "Status", type: "select", options: [...STATUS_OPTIONS] },
];

export function clienteToRow(c: Cliente): Row {
  return {
    id: c.id,
    codigo: c.codigo,
    cliente: c.nome,
    documento: c.documento,
    tipo: c.tipo,
    cidadeUf: `${c.cidade}/${c.estado}`,
    telefone: c.telefone || c.celular,
    limiteCredito: currency(c.limiteCredito),
    status: c.status,
  };
}

// FORNECEDORES
export const fornecedorColumns: ColumnConfig[] = [
  { key: "codigo", label: "Código" },
  { key: "fornecedor", label: "Fornecedor" },
  { key: "documento", label: "CNPJ/CPF" },
  { key: "cidadeUf", label: "Cidade/UF" },
  { key: "categoriaFornecimento", label: "Categoria" },
  { key: "telefone", label: "Telefone" },
  { key: "status", label: "Status", render: "status" },
];

export const fornecedorFilters: FilterConfig[] = [
  { key: "fornecedor", label: "Fornecedor", type: "text" },
  { key: "documento", label: "CNPJ/CPF", type: "text" },
  { key: "categoriaFornecimento", label: "Categoria", type: "select", options: [...CATEGORIAS_FORNECIMENTO] },
  { key: "status", label: "Status", type: "select", options: [...STATUS_OPTIONS] },
];

export function fornecedorToRow(f: Fornecedor): Row {
  return {
    id: f.id,
    codigo: f.codigo,
    fornecedor: f.razaoSocial,
    documento: f.documento,
    cidadeUf: `${f.cidade}/${f.estado}`,
    categoriaFornecimento: f.categoriaFornecimento,
    telefone: f.telefone,
    status: f.status,
  };
}

// TRANSPORTADORAS
export const transportadoraColumns: ColumnConfig[] = [
  { key: "codigo", label: "Código" },
  { key: "transportadora", label: "Transportadora" },
  { key: "cnpj", label: "CNPJ" },
  { key: "cidadeUf", label: "Cidade/UF" },
  { key: "tipoTransporte", label: "Tipo" },
  { key: "telefone", label: "Telefone" },
  { key: "status", label: "Status", render: "status" },
];

export const transportadoraFilters: FilterConfig[] = [
  { key: "transportadora", label: "Transportadora", type: "text" },
  { key: "cnpj", label: "CNPJ", type: "text" },
  { key: "tipoTransporte", label: "Tipo de transporte", type: "select", options: [...TIPOS_TRANSPORTE] },
  { key: "status", label: "Status", type: "select", options: [...STATUS_OPTIONS] },
];

export function transportadoraToRow(t: Transportadora): Row {
  return {
    id: t.id,
    codigo: t.codigo,
    transportadora: t.razaoSocial,
    cnpj: t.cnpj,
    cidadeUf: `${t.cidade}/${t.estado}`,
    tipoTransporte: t.tipoTransporte,
    telefone: t.telefone,
    status: t.status,
  };
}

// MOTORISTAS
export const motoristaColumns: ColumnConfig[] = [
  { key: "codigo", label: "Código" },
  { key: "nome", label: "Nome" },
  { key: "cnh", label: "CNH" },
  { key: "categoriaCnh", label: "Categoria", align: "center" },
  { key: "validadeCnh", label: "Validade CNH" },
  { key: "transportadora", label: "Transportadora" },
  { key: "status", label: "Status", render: "status" },
];

export const motoristaFilters: FilterConfig[] = [
  { key: "nome", label: "Nome", type: "text" },
  { key: "cnh", label: "CNH", type: "text" },
  { key: "categoriaCnh", label: "Categoria CNH", type: "select", options: [...CATEGORIAS_CNH] },
  { key: "status", label: "Status", type: "select", options: [...STATUS_OPTIONS] },
];

export function motoristaToRow(m: Motorista): Row {
  const transportadora = transportadorasRepository.get(m.transportadoraId);
  return {
    id: m.id,
    codigo: m.codigo,
    nome: m.nome,
    cnh: m.cnh,
    categoriaCnh: m.categoriaCnh,
    validadeCnh: cnhAlertaTexto(m.validadeCnh),
    transportadora: transportadora?.razaoSocial ?? "—",
    status: m.status,
  };
}

// VEÍCULOS
export const veiculoColumns: ColumnConfig[] = [
  { key: "codigo", label: "Código" },
  { key: "placa", label: "Placa" },
  { key: "modelo", label: "Modelo" },
  { key: "tipo", label: "Tipo" },
  { key: "capacidadeCarga", label: "Capacidade (kg)", align: "right" },
  { key: "transportadora", label: "Transportadora" },
  { key: "motorista", label: "Motorista" },
  { key: "status", label: "Status", render: "status" },
];

export const veiculoFilters: FilterConfig[] = [
  { key: "placa", label: "Placa", type: "text" },
  { key: "modelo", label: "Modelo", type: "text" },
  { key: "tipo", label: "Tipo", type: "select", options: [...TIPOS_VEICULO] },
  { key: "status", label: "Status", type: "select", options: [...STATUS_OPTIONS] },
];

export function veiculoToRow(v: Veiculo): Row {
  const transportadora = transportadorasRepository.get(v.transportadoraId);
  const motorista = motoristasRepository.get(v.motoristaPrincipalId);
  return {
    id: v.id,
    codigo: v.codigo,
    placa: v.placa,
    modelo: `${v.marca} ${v.modelo}`,
    tipo: v.tipo,
    capacidadeCarga: v.capacidadeCarga,
    transportadora: transportadora?.razaoSocial ?? "—",
    motorista: motorista?.nome ?? "—",
    status: v.status,
  };
}

// USUÁRIOS
export const usuarioColumns: ColumnConfig[] = [
  { key: "codigo", label: "Código" },
  { key: "nome", label: "Nome" },
  { key: "email", label: "E-mail" },
  { key: "perfil", label: "Perfil" },
  { key: "departamento", label: "Departamento" },
  { key: "status", label: "Status", render: "status" },
];

export const usuarioFilters: FilterConfig[] = [
  { key: "nome", label: "Nome", type: "text" },
  { key: "perfil", label: "Perfil", type: "select", options: [...PERFIS_USUARIO_CADASTRO] },
  { key: "status", label: "Status", type: "select", options: [...STATUS_OPTIONS] },
];

export function usuarioToRow(u: Usuario): Row {
  return {
    id: u.id,
    codigo: u.codigo,
    nome: u.nome,
    email: u.email,
    perfil: u.perfil,
    departamento: u.departamento,
    status: u.status,
  };
}

// LOCAIS DE ESTOQUE
export const localEstoqueColumns: ColumnConfig[] = [
  { key: "codigo", label: "Código" },
  { key: "descricao", label: "Descrição" },
  { key: "armazem", label: "Armazém" },
  { key: "tipo", label: "Tipo" },
  { key: "capacidade", label: "Capacidade", align: "right" },
  { key: "status", label: "Status", render: "status" },
];

export const localEstoqueFilters: FilterConfig[] = [
  { key: "codigo", label: "Código", type: "text" },
  { key: "armazem", label: "Armazém", type: "select", options: [...ARMAZENS] },
  { key: "tipo", label: "Tipo", type: "select", options: [...TIPOS_LOCAL_ESTOQUE] },
  { key: "status", label: "Status", type: "select", options: [...STATUS_OPTIONS] },
];

export function localEstoqueToRow(l: LocalEstoque): Row {
  return {
    id: l.id,
    codigo: l.codigoLocal,
    descricao: l.descricao,
    armazem: l.armazem,
    tipo: l.tipo,
    capacidade: l.capacidade,
    status: l.status,
  };
}
