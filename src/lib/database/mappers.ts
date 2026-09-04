import type {
  Produto,
  Cliente,
  Fornecedor,
  Transportadora,
  Motorista,
  Veiculo,
  Usuario,
  LocalEstoque,
  StatusCadastro,
  TipoPessoa,
} from "@/lib/cadastros/types";
import type {
  ProductRow,
  CustomerRow,
  SupplierRow,
  CarrierRow,
  DriverRow,
  VehicleRow,
  UserRow,
  WarehouseLocationRow,
  DbStatus,
} from "./schema";

function statusFromDb(status: DbStatus): StatusCadastro {
  return status === "active" ? "Ativo" : "Inativo";
}

function statusToDb(status: StatusCadastro | undefined): DbStatus | undefined {
  if (status === undefined) return undefined;
  return status === "Ativo" ? "active" : "inactive";
}

function tipoFromDb(type: "individual" | "company"): TipoPessoa {
  return type === "individual" ? "Pessoa Física" : "Pessoa Jurídica";
}

function tipoToDb(tipo: TipoPessoa | undefined): "individual" | "company" | undefined {
  if (tipo === undefined) return undefined;
  return tipo === "Pessoa Física" ? "individual" : "company";
}

// Diferencia "campo não enviado" (undefined — omitido do patch, coluna
// intocada) de "campo enviado vazio" (string vazia — grava NULL). Usar
// `data.campo || null` diretamente converteria "não enviado" em NULL
// também, apagando a coluna em updates parciais que não tocam nela.
function nullableText(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === "" ? null : value;
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

// ---------------------------------------------------------------- Produto
export function productFromRow(row: ProductRow): Produto {
  return {
    id: row.id,
    status: statusFromDb(row.status),
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
    codigo: row.code,
    sku: row.sku ?? "",
    descricao: row.name,
    descricaoCurta: row.description ?? "",
    categoria: row.category ?? "",
    subcategoria: row.subcategory ?? "",
    unidade: row.unit,
    codigoBarras: row.barcode ?? "",
    ncm: row.ncm ?? "",
    peso: Number(row.weight ?? 0),
    altura: Number(row.height_cm ?? 0),
    largura: Number(row.width_cm ?? 0),
    comprimento: Number(row.length_cm ?? 0),
    estoqueMinimo: Number(row.minimum_stock ?? 0),
    estoqueMaximo: Number(row.maximum_stock ?? 0),
    pontoReposicao: Number(row.reorder_point ?? 0),
    localizacaoPadrao: row.default_location_code ?? "",
    fornecedorId: row.supplier_id ?? "",
    loteControlado: row.batch_controlled,
    validadeControlada: row.expiration_controlled,
  };
}

export function productToRowFields(data: Partial<Produto>): Partial<ProductRow> {
  return omitUndefined({
    code: data.codigo,
    sku: nullableText(data.sku),
    barcode: nullableText(data.codigoBarras),
    name: data.descricao,
    description: nullableText(data.descricaoCurta),
    category: nullableText(data.categoria),
    subcategory: nullableText(data.subcategoria),
    unit: data.unidade,
    ncm: nullableText(data.ncm),
    weight: data.peso,
    height_cm: data.altura,
    width_cm: data.largura,
    length_cm: data.comprimento,
    minimum_stock: data.estoqueMinimo,
    maximum_stock: data.estoqueMaximo,
    reorder_point: data.pontoReposicao,
    supplier_id: nullableText(data.fornecedorId),
    default_location_code: nullableText(data.localizacaoPadrao),
    batch_controlled: data.loteControlado,
    expiration_controlled: data.validadeControlada,
    status: statusToDb(data.status),
  } as Record<string, unknown>) as Partial<ProductRow>;
}

// ---------------------------------------------------------------- Cliente
export function customerFromRow(row: CustomerRow): Cliente {
  return {
    id: row.id,
    status: statusFromDb(row.status),
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
    codigo: row.code,
    tipo: tipoFromDb(row.type),
    nome: row.name,
    nomeFantasia: row.trade_name ?? "",
    documento: row.document,
    inscricaoEstadual: row.state_registration ?? "",
    email: row.email ?? "",
    telefone: row.phone ?? "",
    celular: row.mobile_phone ?? "",
    cep: row.zip_code ?? "",
    estado: row.state ?? "",
    cidade: row.city ?? "",
    bairro: row.neighborhood ?? "",
    endereco: row.address ?? "",
    numero: row.address_number ?? "",
    complemento: row.address_complement ?? "",
    limiteCredito: Number(row.credit_limit ?? 0),
    condicaoPagamento: row.payment_terms ?? "",
  };
}

export function customerToRowFields(data: Partial<Cliente>): Partial<CustomerRow> {
  return omitUndefined({
    type: tipoToDb(data.tipo),
    name: data.nome,
    trade_name: nullableText(data.nomeFantasia),
    document: data.documento,
    state_registration: nullableText(data.inscricaoEstadual),
    email: nullableText(data.email),
    phone: nullableText(data.telefone),
    mobile_phone: nullableText(data.celular),
    zip_code: nullableText(data.cep),
    state: nullableText(data.estado),
    city: nullableText(data.cidade),
    neighborhood: nullableText(data.bairro),
    address: nullableText(data.endereco),
    address_number: nullableText(data.numero),
    address_complement: nullableText(data.complemento),
    credit_limit: data.limiteCredito,
    payment_terms: nullableText(data.condicaoPagamento),
    status: statusToDb(data.status),
  } as Record<string, unknown>) as Partial<CustomerRow>;
}

// ------------------------------------------------------------ Fornecedor
export function supplierFromRow(row: SupplierRow): Fornecedor {
  return {
    id: row.id,
    status: statusFromDb(row.status),
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
    codigo: row.code,
    tipo: tipoFromDb(row.type),
    razaoSocial: row.legal_name,
    nomeFantasia: row.trade_name ?? "",
    documento: row.document,
    inscricaoEstadual: row.state_registration ?? "",
    email: row.email ?? "",
    telefone: row.phone ?? "",
    contato: row.contact_name ?? "",
    cep: row.zip_code ?? "",
    estado: row.state ?? "",
    cidade: row.city ?? "",
    bairro: row.neighborhood ?? "",
    endereco: row.address ?? "",
    numero: row.address_number ?? "",
    complemento: row.address_complement ?? "",
    prazoMedioEntrega: Number(row.average_delivery_days ?? 0),
    condicaoPagamento: row.payment_terms ?? "",
    categoriaFornecimento: row.supplier_category ?? "",
    observacoes: row.notes ?? "",
  };
}

export function supplierToRowFields(data: Partial<Fornecedor>): Partial<SupplierRow> {
  return omitUndefined({
    type: tipoToDb(data.tipo),
    legal_name: data.razaoSocial,
    trade_name: nullableText(data.nomeFantasia),
    document: data.documento,
    state_registration: nullableText(data.inscricaoEstadual),
    email: nullableText(data.email),
    phone: nullableText(data.telefone),
    contact_name: nullableText(data.contato),
    zip_code: nullableText(data.cep),
    state: nullableText(data.estado),
    city: nullableText(data.cidade),
    neighborhood: nullableText(data.bairro),
    address: nullableText(data.endereco),
    address_number: nullableText(data.numero),
    address_complement: nullableText(data.complemento),
    average_delivery_days: data.prazoMedioEntrega,
    payment_terms: nullableText(data.condicaoPagamento),
    supplier_category: nullableText(data.categoriaFornecimento),
    notes: nullableText(data.observacoes),
    status: statusToDb(data.status),
  } as Record<string, unknown>) as Partial<SupplierRow>;
}

// --------------------------------------------------------- Transportadora
export function carrierFromRow(row: CarrierRow): Transportadora {
  return {
    id: row.id,
    status: statusFromDb(row.status),
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
    codigo: row.code,
    razaoSocial: row.legal_name,
    nomeFantasia: row.trade_name ?? "",
    cnpj: row.document,
    inscricaoEstadual: row.state_registration ?? "",
    email: row.email ?? "",
    telefone: row.phone ?? "",
    responsavel: row.responsible_name ?? "",
    cep: row.zip_code ?? "",
    estado: row.state ?? "",
    cidade: row.city ?? "",
    endereco: row.address ?? "",
    tipoTransporte: row.transport_type ?? "",
    regiaoAtendimento: row.coverage_region ?? "",
  };
}

export function carrierToRowFields(data: Partial<Transportadora>): Partial<CarrierRow> {
  return omitUndefined({
    legal_name: data.razaoSocial,
    trade_name: nullableText(data.nomeFantasia),
    document: data.cnpj,
    state_registration: nullableText(data.inscricaoEstadual),
    email: nullableText(data.email),
    phone: nullableText(data.telefone),
    responsible_name: nullableText(data.responsavel),
    zip_code: nullableText(data.cep),
    state: nullableText(data.estado),
    city: nullableText(data.cidade),
    address: nullableText(data.endereco),
    transport_type: nullableText(data.tipoTransporte),
    coverage_region: nullableText(data.regiaoAtendimento),
    status: statusToDb(data.status),
  } as Record<string, unknown>) as Partial<CarrierRow>;
}

// ------------------------------------------------------------- Motorista
export function driverFromRow(row: DriverRow): Motorista {
  return {
    id: row.id,
    status: statusFromDb(row.status),
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
    codigo: row.code,
    nome: row.name,
    cpf: row.document,
    rg: row.rg ?? "",
    cnh: row.cnh_number,
    categoriaCnh: row.cnh_category,
    validadeCnh: row.cnh_expiration ?? "",
    telefone: row.phone ?? "",
    transportadoraId: row.carrier_id ?? "",
  };
}

export function driverToRowFields(data: Partial<Motorista>): Partial<DriverRow> {
  return omitUndefined({
    carrier_id: nullableText(data.transportadoraId),
    name: data.nome,
    document: data.cpf,
    rg: nullableText(data.rg),
    cnh_number: data.cnh,
    cnh_category: data.categoriaCnh,
    cnh_expiration: nullableText(data.validadeCnh),
    phone: nullableText(data.telefone),
    status: statusToDb(data.status),
  } as Record<string, unknown>) as Partial<DriverRow>;
}

// --------------------------------------------------------------- Veículo
export function vehicleFromRow(row: VehicleRow): Veiculo {
  return {
    id: row.id,
    status: statusFromDb(row.status),
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
    codigo: row.code,
    placa: row.plate,
    renavam: row.renavam ?? "",
    marca: row.brand ?? "",
    modelo: row.model,
    ano: Number(row.year ?? 0),
    tipo: row.type ?? "",
    capacidadeCarga: Number(row.cargo_capacity_kg ?? 0),
    pesoMaximo: Number(row.max_weight_kg ?? 0),
    transportadoraId: row.carrier_id ?? "",
    motoristaPrincipalId: row.driver_id ?? "",
    combustivel: row.fuel_type ?? "",
  };
}

export function vehicleToRowFields(data: Partial<Veiculo>): Partial<VehicleRow> {
  return omitUndefined({
    carrier_id: nullableText(data.transportadoraId),
    driver_id: nullableText(data.motoristaPrincipalId),
    plate: data.placa,
    renavam: nullableText(data.renavam),
    brand: nullableText(data.marca),
    model: data.modelo,
    year: data.ano,
    type: nullableText(data.tipo),
    cargo_capacity_kg: data.capacidadeCarga,
    max_weight_kg: data.pesoMaximo,
    fuel_type: nullableText(data.combustivel),
    status: statusToDb(data.status),
  } as Record<string, unknown>) as Partial<VehicleRow>;
}

// --------------------------------------------------------------- Usuário
export function userFromRow(row: UserRow): Usuario {
  return {
    id: row.id,
    status: statusFromDb(row.status),
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
    codigo: row.code,
    nome: row.name,
    email: row.email,
    login: row.login,
    perfil: row.role ?? "",
    departamento: row.department ?? "",
  };
}

export function userToRowFields(data: Partial<Usuario>): Partial<UserRow> {
  return omitUndefined({
    name: data.nome,
    email: data.email,
    login: data.login,
    role: nullableText(data.perfil),
    department: nullableText(data.departamento),
    status: statusToDb(data.status),
  } as Record<string, unknown>) as Partial<UserRow>;
}

// ------------------------------------------------------- Local de estoque
export function warehouseLocationFromRow(row: WarehouseLocationRow): LocalEstoque {
  return {
    id: row.id,
    status: statusFromDb(row.status),
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
    codigoLocal: row.code,
    descricao: row.name ?? "",
    armazem: row.warehouse ?? "",
    area: row.zone ?? "",
    rua: row.aisle ?? "",
    modulo: row.rack ?? "",
    nivel: row.level ?? "",
    posicao: row.position ?? "",
    tipo: row.location_type ?? "",
    capacidade: Number(row.capacity ?? 0),
  };
}

export function warehouseLocationToRowFields(data: Partial<LocalEstoque>): Partial<WarehouseLocationRow> {
  return omitUndefined({
    code: data.codigoLocal,
    name: nullableText(data.descricao),
    warehouse: nullableText(data.armazem),
    zone: nullableText(data.area),
    aisle: nullableText(data.rua),
    rack: nullableText(data.modulo),
    level: nullableText(data.nivel),
    position: nullableText(data.posicao),
    location_type: nullableText(data.tipo),
    capacity: data.capacidade,
    status: statusToDb(data.status),
  } as Record<string, unknown>) as Partial<WarehouseLocationRow>;
}
