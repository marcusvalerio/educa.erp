#!/usr/bin/env node
// Gera supabase/seed.sql com dados iniciais coerentes para os 8
// cadastros, usando os mesmos nomes/pools "didáticos e realistas" já
// usados na interface (Fase 1/4: src/lib/mock/pools.ts). Não editar o
// .sql gerado manualmente — regravar com `node scripts/generate-seed.mjs`.
//
// UUIDs são pré-gerados aqui (não pelo `default gen_random_uuid()` da
// tabela) para que possamos referenciá-los como chave estrangeira dentro
// do mesmo arquivo estático (ex.: driver.carrier_id apontando para um
// carrier inserido acima). As colunas `code` de customers/suppliers/
// carriers/drivers/vehicles/users são deixadas de fora do INSERT de
// propósito — o trigger fn_generate_code (migration 0002) as preenche
// automaticamente, na ordem de inserção.

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPANY_ID = "00000000-0000-0000-0000-000000000001";

function seededRandom(seed) {
  let a = seed;
  return function rnd() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
const int = (rnd, min, max) => Math.floor(rnd() * (max - min + 1)) + min;

const EMPRESAS = [
  "Distribuidora Horizonte Ltda", "Comercial Andrade S.A.", "Grupo Metropolitano de Suprimentos",
  "Atacado Boa Vista", "Indústria Serra Azul", "Nordeste Suprimentos Ltda",
  "Padrão Comercial e Distribuição", "União Distribuição S.A.", "Vale Alimentos Ltda",
  "Central de Materiais SP", "Rede Sul Comércio", "Tech Parts Componentes",
  "AgroForte Insumos", "Metalúrgica Nova Era", "Construfácil Materiais",
  "Química Bandeirantes", "Embalagens Ipê", "Auto Peças Continental",
];
const TRANSPORTADORAS = [
  "Rota Express Transportes", "TransBrasil Logística", "Veloz Cargas e Encomendas",
  "Malha Sul Transportes", "ExpressoNacional Ltda", "Cargo Plus Logística",
  "TransAtlântico Distribuição", "Fronteira Transportes", "Log Express Brasil",
  "Transportes Rio Verde",
];
const PESSOAS = [
  "Carlos Eduardo Silva", "Fernanda Souza Lima", "Ricardo Almeida Costa", "Juliana Pereira Rocha",
  "Marcos Vinícius Santos", "Patrícia Gomes Ferreira", "André Luiz Barbosa", "Camila Rodrigues Dias",
  "Bruno Henrique Martins", "Larissa Cardoso Nunes", "Eduardo Nogueira Teixeira", "Aline Ribeiro Castro",
  "Rafael Correia Monteiro", "Débora Cristina Alves", "Thiago Moreira Pinto", "Vanessa Lopes Freitas",
];
const CIDADES_UF = [
  ["São Paulo", "SP"], ["Campinas", "SP"], ["Rio de Janeiro", "RJ"], ["Curitiba", "PR"],
  ["Porto Alegre", "RS"], ["Belo Horizonte", "MG"], ["Salvador", "BA"], ["Recife", "PE"],
  ["Fortaleza", "CE"], ["Goiânia", "GO"], ["Manaus", "AM"], ["Vitória", "ES"],
];
const PRODUTOS = [
  "Parafuso Sextavado M8", "Chapa de Aço Carbono 2mm", "Caixa de Papelão Ondulado",
  "Luva de Proteção EPI", "Cabo Elétrico 2,5mm", "Rolamento Industrial 6204",
  "Filme Stretch 500mm", "Sensor de Proximidade Indutivo", "Correia Transportadora PVC",
  "Palete PBR Padrão", "Óleo Lubrificante Industrial 20L", "Fita Adesiva Reforçada",
  "Motor Elétrico Trifásico 5CV", "Conector Terminal Elétrico", "Válvula Solenoide 1/2\"",
  "Etiqueta Térmica Adesiva", "Bateria Industrial 12V", "Tubo PVC Soldável 25mm",
  "Capacete de Segurança Classe A", "Balança Digital Industrial", "Solvente Industrial 5L",
  "Óculos de Proteção", "Extintor de Incêndio 6kg", "Fechadura Industrial", "Mangueira Hidráulica",
  "Disjuntor Trifásico 40A", "Compressor de Ar 25L", "Termômetro Industrial", "Silo Plástico 500L",
  "Empilhadeira Manual Paleteira",
];
const CATEGORIAS = ["Matéria-prima", "Material de almoxarifado", "Material elétrico", "EPI", "Ferramentas", "Químicos", "Líquidos", "Embalagens", "Produto acabado"];
const UNIDADES = ["UN", "KG", "G", "L", "ML", "M", "CX", "PC", "KIT", "T"];
const CATEGORIAS_CNH = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"];
const TIPOS_VEICULO = ["Fiorino", "Van", "VUC", "Caminhão 3/4", "Toco", "Truck", "Carreta", "Bitrem", "Rodotrem"];
const COMBUSTIVEIS = ["Diesel", "Gasolina", "Etanol", "Flex", "Elétrico", "GNV"];
const CATEGORIAS_FORNECIMENTO = ["Matéria-prima", "Material elétrico", "Químicos", "Almoxarifado", "EPI", "Embalagens", "Serviços", "Outros"];
const TIPOS_TRANSPORTE = ["Rodoviário", "Aéreo", "Marítimo", "Ferroviário", "Multimodal"];
const REGIOES = ["Sudeste", "Sul", "Nordeste", "Centro-Oeste", "Norte", "Nacional"];
const CONDICOES_PAGAMENTO = ["À vista", "7 dias", "14 dias", "28 dias", "30 dias", "30/60 dias", "30/60/90 dias"];
const PERFIS = ["Administrador", "Gestor", "Compras", "Recebimento", "Almoxarifado", "Expedição", "Comercial", "Financeiro", "Fiscal", "Consulta"];
const DEPARTAMENTOS = ["Diretoria", "Operações", "Compras", "Comercial", "Financeiro", "Fiscal", "Logística", "TI"];
const TIPOS_LOCAL = ["Recebimento", "Staging", "Armazenagem", "Picking", "Packing", "Expedição", "Quarentena", "Devolução", "Bloqueado"];
const ARMAZENS = ["CD01", "CD02", "FIL03"];

function sql(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function digits(rnd, n) {
  return Array.from({ length: n }, () => int(rnd, 0, 9)).join("");
}
function cnpj(rnd) {
  return `${digits(rnd, 2)}.${digits(rnd, 3)}.${digits(rnd, 3)}/0001-${digits(rnd, 2)}`;
}
function cpf(rnd) {
  return `${digits(rnd, 3)}.${digits(rnd, 3)}.${digits(rnd, 3)}-${digits(rnd, 2)}`;
}
function cep(rnd) {
  return `${digits(rnd, 5)}-${digits(rnd, 3)}`;
}
function placaMercosul(rnd) {
  const l = () => String.fromCharCode(65 + int(rnd, 0, 25));
  return `${l()}${l()}${l()}${int(rnd, 1, 9)}${l()}${int(rnd, 10, 99)}`;
}
function slug(text) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

const rnd = seededRandom(72501);
const lines = [];
const insert = (table, columns, values) => {
  lines.push(`insert into public.${table} (${columns.join(", ")}) values (${values.map(sql).join(", ")});`);
};

lines.push("-- Gerado por scripts/generate-seed.mjs — não editar manualmente.");
lines.push("-- Para regravar: node scripts/generate-seed.mjs");
lines.push("-- Para aplicar: cole no SQL Editor do Supabase ou rode via `supabase db push`");
lines.push("--   seguido de `psql \"$SUPABASE_DB_URL\" -f supabase/seed.sql` (ver docs/SUPABASE.md).\n");
lines.push("begin;\n");

// ------------------------------------------------------------ companies
insert(
  "companies",
  ["id", "name", "legal_name", "document", "email", "phone", "address", "city", "state", "zip_code", "status"],
  [COMPANY_ID, "ASTRA.ERP", "ASTRA Soluções Logísticas Ltda.", "12.345.678/0001-90",
    "contato@astraerp.com.br", "(11) 4000-1000", "Av. das Indústrias, 1200", "São Paulo", "SP", "04571-000", "active"]
);
lines.push("");

// ------------------------------------------------------ warehouse_locations
const RUAS = ["01", "02", "03", "04", "05"];
const MODULOS = ["01", "02", "03", "04"];
const NIVEIS = ["01", "02", "03"];
const POSICOES = ["01", "02", "03", "04"];
const locais = [];
const usedCodes = new Set();
while (locais.length < 30) {
  const armazem = pick(rnd, ARMAZENS);
  const rua = pick(rnd, RUAS);
  const modulo = pick(rnd, MODULOS);
  const nivel = pick(rnd, NIVEIS);
  const posicao = pick(rnd, POSICOES);
  const code = `${armazem}-R${rua}-M${modulo}-N${nivel}-P${posicao}`;
  if (usedCodes.has(code)) continue;
  usedCodes.add(code);
  const tipo = pick(rnd, TIPOS_LOCAL);
  locais.push({ id: randomUUID(), code, tipo, armazem, rua, modulo, nivel, posicao });
}
for (const l of locais) {
  insert(
    "warehouse_locations",
    ["id", "company_id", "code", "name", "warehouse", "zone", "aisle", "rack", "level", "position", "location_type", "capacity", "status"],
    [l.id, COMPANY_ID, l.code, `${l.tipo} — ${l.armazem} rua ${l.rua}`, l.armazem, l.tipo, l.rua, l.modulo, l.nivel, l.posicao, l.tipo, int(rnd, 50, 5000), rnd() > 0.12 ? "active" : "inactive"]
  );
}
lines.push("");

// -------------------------------------------------------------- carriers
const carriers = TRANSPORTADORAS.map((nome) => ({ id: randomUUID(), nome }));
for (const c of carriers) {
  insert(
    "carriers",
    ["id", "company_id", "legal_name", "trade_name", "document", "state_registration", "email", "phone", "responsible_name", "zip_code", "state", "city", "address", "transport_type", "coverage_region", "status"],
    [c.id, COMPANY_ID, c.nome, c.nome.split(" ").slice(0, 2).join(" "), cnpj(rnd), digits(rnd, 9),
      `contato@${slug(c.nome.split(" ")[0])}.com.br`, `(${int(rnd, 11, 91)}) ${int(rnd, 3000, 4999)}-${digits(rnd, 4)}`,
      pick(rnd, PESSOAS), cep(rnd), pick(rnd, CIDADES_UF)[1], pick(rnd, CIDADES_UF)[0], `Av. dos Transportes, ${int(rnd, 100, 3000)}`,
      pick(rnd, TIPOS_TRANSPORTE), pick(rnd, REGIOES), rnd() > 0.1 ? "active" : "inactive"]
  );
}
lines.push("");

// ------------------------------------------------------------- suppliers
const suppliers = EMPRESAS.slice(0, 15).map((nome) => ({ id: randomUUID(), nome }));
for (const s of suppliers) {
  insert(
    "suppliers",
    ["id", "company_id", "type", "legal_name", "trade_name", "document", "state_registration", "email", "phone", "contact_name", "zip_code", "state", "city", "neighborhood", "address", "address_number", "average_delivery_days", "payment_terms", "supplier_category", "status"],
    [s.id, COMPANY_ID, "company", s.nome, s.nome.split(" ").slice(0, 2).join(" "), cnpj(rnd), digits(rnd, 9),
      `compras@${slug(s.nome.split(" ")[0])}.com.br`, `(${int(rnd, 11, 91)}) ${int(rnd, 3000, 4999)}-${digits(rnd, 4)}`,
      pick(rnd, PESSOAS), cep(rnd), pick(rnd, CIDADES_UF)[1], pick(rnd, CIDADES_UF)[0], "Distrito Industrial",
      `Rua das Indústrias, ${int(rnd, 50, 2000)}`, String(int(rnd, 10, 999)), int(rnd, 2, 30),
      pick(rnd, CONDICOES_PAGAMENTO), pick(rnd, CATEGORIAS_FORNECIMENTO), rnd() > 0.15 ? "active" : "inactive"]
  );
}
lines.push("");

// --------------------------------------------------------------- drivers
const drivers = PESSOAS.map((nome) => ({ id: randomUUID(), nome, carrier: pick(rnd, carriers) }));
for (const [i, d] of drivers.entries()) {
  const validade = i % 4 === 0 ? daysFromNow(int(rnd, -20, 15)) : daysFromNow(int(rnd, 60, 900));
  insert(
    "drivers",
    ["id", "company_id", "carrier_id", "name", "document", "rg", "cnh_number", "cnh_category", "cnh_expiration", "phone", "status"],
    [d.id, COMPANY_ID, d.carrier.id, d.nome, cpf(rnd), digits(rnd, 9), digits(rnd, 11), pick(rnd, CATEGORIAS_CNH),
      validade, `(${int(rnd, 11, 91)}) 9${digits(rnd, 4)}-${digits(rnd, 4)}`, rnd() > 0.1 ? "active" : "inactive"]
  );
}
lines.push("");

// -------------------------------------------------------------- vehicles
const MARCAS_MODELOS = [
  ["Volkswagen", "Delivery 9.170"], ["Mercedes-Benz", "Atego 1719"], ["Volvo", "FH 460"],
  ["Iveco", "Daily 70C16"], ["Ford", "Cargo 1719"], ["Scania", "R 450"], ["Hyundai", "HR"], ["Fiat", "Fiorino"],
];
for (let i = 0; i < 15; i++) {
  const [marca, modelo] = pick(rnd, MARCAS_MODELOS);
  const carrier = pick(rnd, carriers);
  const driver = pick(rnd, drivers);
  insert(
    "vehicles",
    ["id", "company_id", "carrier_id", "driver_id", "plate", "renavam", "brand", "model", "year", "type", "cargo_capacity_kg", "max_weight_kg", "fuel_type", "status"],
    [randomUUID(), COMPANY_ID, carrier.id, driver.id, placaMercosul(rnd), digits(rnd, 11), marca, modelo,
      int(rnd, 2014, 2025), pick(rnd, TIPOS_VEICULO), int(rnd, 800, 32000), int(rnd, 1500, 45000), pick(rnd, COMBUSTIVEIS),
      rnd() > 0.12 ? "active" : "inactive"]
  );
}
lines.push("");

// -------------------------------------------------------------- products
for (let i = 0; i < 30; i++) {
  const supplier = pick(rnd, suppliers);
  const local = pick(rnd, locais);
  const estoqueMinimo = int(rnd, 10, 200);
  const estoqueMaximo = estoqueMinimo + int(rnd, 200, 2000);
  insert(
    "products",
    ["id", "company_id", "code", "sku", "barcode", "name", "description", "category", "unit", "ncm", "weight", "height_cm", "width_cm", "length_cm", "minimum_stock", "maximum_stock", "reorder_point", "supplier_id", "default_location_code", "batch_controlled", "expiration_controlled", "status"],
    [randomUUID(), COMPANY_ID, `PRD-${String(i + 1).padStart(4, "0")}`, `SKU-${digits(rnd, 6)}`, `789${digits(rnd, 10)}`,
      PRODUTOS[i % PRODUTOS.length], PRODUTOS[i % PRODUTOS.length].split(" ").slice(0, 2).join(" "),
      pick(rnd, CATEGORIAS), pick(rnd, UNIDADES), `${digits(rnd, 4)}.${digits(rnd, 2)}.${digits(rnd, 2)}`,
      Number((rnd() * 48 + 0.1).toFixed(2)), Number((rnd() * 90 + 5).toFixed(1)), Number((rnd() * 90 + 5).toFixed(1)), Number((rnd() * 120 + 5).toFixed(1)),
      estoqueMinimo, estoqueMaximo, estoqueMinimo + Math.round((estoqueMaximo - estoqueMinimo) * 0.2),
      supplier.id, local.code, rnd() > 0.6, rnd() > 0.75, rnd() > 0.1 ? "active" : "inactive"]
  );
}
lines.push("");

// ------------------------------------------------------------- customers
for (let i = 0; i < 20; i++) {
  const isCompany = i % 4 !== 0;
  const nome = isCompany ? EMPRESAS[(i + 3) % EMPRESAS.length] : PESSOAS[i % PESSOAS.length];
  const [cidade, uf] = pick(rnd, CIDADES_UF);
  insert(
    "customers",
    ["id", "company_id", "type", "name", "trade_name", "document", "state_registration", "email", "phone", "mobile_phone", "zip_code", "state", "city", "neighborhood", "address", "address_number", "credit_limit", "payment_terms", "status"],
    [randomUUID(), COMPANY_ID, isCompany ? "company" : "individual", nome, isCompany ? nome.split(" ").slice(0, 2).join(" ") : null,
      isCompany ? cnpj(rnd) : cpf(rnd), isCompany ? digits(rnd, 9) : "Isento",
      `contato@${slug(nome.split(" ")[0])}.com.br`, `(${int(rnd, 11, 91)}) ${int(rnd, 3000, 4999)}-${digits(rnd, 4)}`,
      `(${int(rnd, 11, 91)}) 9${digits(rnd, 4)}-${digits(rnd, 4)}`, cep(rnd), uf, cidade,
      pick(rnd, ["Centro", "Jardim Industrial", "Vila Nova", "Distrito Empresarial"]),
      `Rua ${pick(rnd, ["das Flores", "Sete de Setembro", "Voluntários", "Rio Branco"])}`, String(int(rnd, 10, 2500)),
      int(rnd, 2000, 250000), pick(rnd, CONDICOES_PAGAMENTO), rnd() > 0.1 ? "active" : "inactive"]
  );
}
lines.push("");

// ----------------------------------------------------------------- users
for (let i = 0; i < 10; i++) {
  const nome = PESSOAS[(i + 5) % PESSOAS.length];
  const primeiro = slug(nome.split(" ")[0]);
  const ultimo = slug(nome.split(" ").at(-1));
  insert(
    "users",
    ["id", "company_id", "name", "email", "login", "role", "department", "status"],
    [randomUUID(), COMPANY_ID, nome, `${primeiro}.${ultimo}@astraerp.com.br`, `${primeiro}.${ultimo}`,
      PERFIS[i % PERFIS.length], pick(rnd, DEPARTAMENTOS), rnd() > 0.1 ? "active" : "inactive"]
  );
}

lines.push("\ncommit;\n");

writeFileSync(join(__dirname, "..", "supabase", "seed.sql"), lines.join("\n"), "utf8");
console.log("supabase/seed.sql gerado com sucesso.");
