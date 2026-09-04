import { seededRandom, pick, int } from "@/lib/mock/rng";
import { EMPRESAS, TRANSPORTADORAS, PESSOAS, CIDADES } from "@/lib/mock/pools";
import {
  CATEGORIAS_PRODUTO,
  SUBCATEGORIAS_PRODUTO,
  UNIDADES_PRODUTO,
  CONDICOES_PAGAMENTO,
  ESTADOS_UF,
  CATEGORIAS_FORNECIMENTO,
  TIPOS_TRANSPORTE,
  REGIOES_ATENDIMENTO,
  CATEGORIAS_CNH,
  TIPOS_VEICULO,
  COMBUSTIVEIS,
  PERFIS_USUARIO_CADASTRO,
  DEPARTAMENTOS,
  TIPOS_LOCAL_ESTOQUE,
  ARMAZENS,
} from "./constants";
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

function digits(rnd: () => number, n: number) {
  return Array.from({ length: n }, () => int(rnd, 0, 9)).join("");
}

function cnpj(rnd: () => number) {
  return `${digits(rnd, 2)}.${digits(rnd, 3)}.${digits(rnd, 3)}/000${int(rnd, 1, 1)}-${digits(rnd, 2)}`;
}

function cpf(rnd: () => number) {
  return `${digits(rnd, 3)}.${digits(rnd, 3)}.${digits(rnd, 3)}-${digits(rnd, 2)}`;
}

function cep(rnd: () => number) {
  return `${digits(rnd, 5)}-${digits(rnd, 3)}`;
}

function placa(rnd: () => number) {
  const letras = () => String.fromCharCode(65 + int(rnd, 0, 25));
  return `${letras()}${letras()}${letras()}${int(rnd, 1, 9)}${letras()}${int(rnd, 10, 99)}`;
}

function renavam(rnd: () => number) {
  return digits(rnd, 11);
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function pastDate(rnd: () => number, maxDaysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - int(rnd, 1, maxDaysAgo));
  return isoDate(d);
}

function id(prefix: string, n: number) {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

const RUAS = ["01", "02", "03", "04", "05"];
const MODULOS = ["01", "02", "03", "04"];
const NIVEIS = ["01", "02", "03"];
const POSICOES = ["01", "02", "03", "04"];

export function seedLocaisEstoque(n = 30): LocalEstoque[] {
  const rnd = seededRandom(41001);
  const usedCodes = new Set<string>();
  return Array.from({ length: n }, (_, i) => {
    let armazem: (typeof ARMAZENS)[number];
    let rua: string;
    let modulo: string;
    let nivel: string;
    let posicao: string;
    let codigoLocal: string;
    do {
      armazem = pick(rnd, ARMAZENS);
      rua = pick(rnd, RUAS);
      modulo = pick(rnd, MODULOS);
      nivel = pick(rnd, NIVEIS);
      posicao = pick(rnd, POSICOES);
      codigoLocal = `${armazem}-R${rua}-M${modulo}-N${nivel}-P${posicao}`;
    } while (usedCodes.has(codigoLocal));
    usedCodes.add(codigoLocal);
    const tipo = pick(rnd, TIPOS_LOCAL_ESTOQUE);
    const criadoEm = pastDate(rnd, 300);
    return {
      id: id("LOC", i + 1),
      codigoLocal,
      descricao: `${tipo} — ${armazem} rua ${rua}`,
      armazem,
      area: tipo,
      rua,
      modulo,
      nivel,
      posicao,
      tipo,
      capacidade: int(rnd, 50, 5000),
      status: rnd() > 0.12 ? "Ativo" : "Inativo",
      criadoEm,
      atualizadoEm: criadoEm,
    };
  });
}

export function seedTransportadoras(n = 10): Transportadora[] {
  const rnd = seededRandom(41002);
  return Array.from({ length: n }, (_, i) => {
    const nome = TRANSPORTADORAS[i % TRANSPORTADORAS.length];
    const criadoEm = pastDate(rnd, 400);
    return {
      id: id("TRA", i + 1),
      razaoSocial: nome,
      nomeFantasia: nome.split(" ").slice(0, 2).join(" "),
      cnpj: cnpj(rnd),
      inscricaoEstadual: digits(rnd, 9),
      email: `contato@${nome.split(" ")[0].toLowerCase()}.com.br`,
      telefone: `(${int(rnd, 11, 91)}) ${int(rnd, 3000, 4999)}-${digits(rnd, 4)}`,
      responsavel: pick(rnd, PESSOAS),
      cep: cep(rnd),
      estado: pick(rnd, ESTADOS_UF),
      cidade: pick(rnd, CIDADES).split("/")[0],
      endereco: `Av. dos Transportes, ${int(rnd, 100, 3000)}`,
      tipoTransporte: pick(rnd, TIPOS_TRANSPORTE),
      regiaoAtendimento: pick(rnd, REGIOES_ATENDIMENTO),
      status: rnd() > 0.1 ? "Ativo" : "Inativo",
      criadoEm,
      atualizadoEm: criadoEm,
    };
  });
}

export function seedFornecedores(n = 15): Fornecedor[] {
  const rnd = seededRandom(41003);
  return Array.from({ length: n }, (_, i) => {
    const razaoSocial = EMPRESAS[i % EMPRESAS.length];
    const criadoEm = pastDate(rnd, 500);
    return {
      id: id("FOR", i + 1),
      tipo: "Pessoa Jurídica",
      razaoSocial,
      nomeFantasia: razaoSocial.split(" ").slice(0, 2).join(" "),
      documento: cnpj(rnd),
      inscricaoEstadual: digits(rnd, 9),
      email: `compras@${razaoSocial.split(" ")[0].toLowerCase()}.com.br`,
      telefone: `(${int(rnd, 11, 91)}) ${int(rnd, 3000, 4999)}-${digits(rnd, 4)}`,
      contato: pick(rnd, PESSOAS),
      cep: cep(rnd),
      estado: pick(rnd, ESTADOS_UF),
      cidade: pick(rnd, CIDADES).split("/")[0],
      bairro: "Distrito Industrial",
      endereco: `Rua das Indústrias, ${int(rnd, 50, 2000)}`,
      numero: String(int(rnd, 10, 999)),
      complemento: rnd() > 0.6 ? `Galpão ${int(rnd, 1, 12)}` : "",
      prazoMedioEntrega: int(rnd, 2, 30),
      condicaoPagamento: pick(rnd, CONDICOES_PAGAMENTO),
      categoriaFornecimento: pick(rnd, CATEGORIAS_FORNECIMENTO),
      observacoes: "",
      status: rnd() > 0.15 ? "Ativo" : "Inativo",
      criadoEm,
      atualizadoEm: criadoEm,
    };
  });
}

export function seedMotoristas(transportadoras: Transportadora[], n = 15): Motorista[] {
  const rnd = seededRandom(41004);
  return Array.from({ length: n }, (_, i) => {
    const criadoEm = pastDate(rnd, 350);
    let validadeCnh: string;
    if (i % 7 === 0) {
      const d = new Date();
      d.setDate(d.getDate() + int(rnd, -20, 15));
      validadeCnh = isoDate(d);
    } else {
      const d = new Date();
      d.setDate(d.getDate() + int(rnd, 60, 900));
      validadeCnh = isoDate(d);
    }
    return {
      id: id("MOT", i + 1),
      nome: PESSOAS[i % PESSOAS.length],
      cpf: cpf(rnd),
      rg: digits(rnd, 9),
      cnh: digits(rnd, 11),
      categoriaCnh: pick(rnd, CATEGORIAS_CNH),
      validadeCnh,
      telefone: `(${int(rnd, 11, 91)}) 9${digits(rnd, 4)}-${digits(rnd, 4)}`,
      transportadoraId: pick(rnd, transportadoras).id,
      status: rnd() > 0.1 ? "Ativo" : "Inativo",
      criadoEm,
      atualizadoEm: criadoEm,
    };
  });
}

export function seedVeiculos(transportadoras: Transportadora[], motoristas: Motorista[], n = 15): Veiculo[] {
  const rnd = seededRandom(41005);
  const marcasModelos: [string, string][] = [
    ["Volkswagen", "Delivery 9.170"],
    ["Mercedes-Benz", "Atego 1719"],
    ["Volvo", "FH 460"],
    ["Iveco", "Daily 70C16"],
    ["Ford", "Cargo 1719"],
    ["Scania", "R 450"],
    ["Hyundai", "HR"],
    ["Fiat", "Fiorino"],
  ];
  return Array.from({ length: n }, (_, i) => {
    const [marca, modelo] = pick(rnd, marcasModelos);
    const criadoEm = pastDate(rnd, 300);
    return {
      id: id("VEI", i + 1),
      placa: placa(rnd),
      renavam: renavam(rnd),
      marca,
      modelo,
      ano: int(rnd, 2014, 2025),
      tipo: pick(rnd, TIPOS_VEICULO),
      capacidadeCarga: int(rnd, 800, 32000),
      pesoMaximo: int(rnd, 1500, 45000),
      transportadoraId: pick(rnd, transportadoras).id,
      motoristaPrincipalId: pick(rnd, motoristas).id,
      combustivel: pick(rnd, COMBUSTIVEIS),
      status: rnd() > 0.12 ? "Ativo" : "Inativo",
      criadoEm,
      atualizadoEm: criadoEm,
    };
  });
}

export function seedClientes(n = 20): Cliente[] {
  const rnd = seededRandom(41006);
  return Array.from({ length: n }, (_, i) => {
    const pessoaJuridica = i % 4 !== 0;
    const nome = pessoaJuridica ? EMPRESAS[(i + 3) % EMPRESAS.length] : PESSOAS[i % PESSOAS.length];
    const criadoEm = pastDate(rnd, 450);
    return {
      id: id("CLI", i + 1),
      tipo: pessoaJuridica ? "Pessoa Jurídica" : "Pessoa Física",
      nome,
      nomeFantasia: pessoaJuridica ? nome.split(" ").slice(0, 2).join(" ") : "",
      documento: pessoaJuridica ? cnpj(rnd) : cpf(rnd),
      inscricaoEstadual: pessoaJuridica ? digits(rnd, 9) : "Isento",
      email: `contato@${nome.split(" ")[0].toLowerCase()}.com.br`,
      telefone: `(${int(rnd, 11, 91)}) ${int(rnd, 3000, 4999)}-${digits(rnd, 4)}`,
      celular: `(${int(rnd, 11, 91)}) 9${digits(rnd, 4)}-${digits(rnd, 4)}`,
      cep: cep(rnd),
      estado: pick(rnd, ESTADOS_UF),
      cidade: pick(rnd, CIDADES).split("/")[0],
      bairro: pick(rnd, ["Centro", "Jardim Industrial", "Vila Nova", "Distrito Empresarial"]),
      endereco: `Rua ${pick(rnd, ["das Flores", "Sete de Setembro", "Voluntários", "Rio Branco"])}`,
      numero: String(int(rnd, 10, 2500)),
      complemento: "",
      limiteCredito: int(rnd, 2000, 250000),
      condicaoPagamento: pick(rnd, CONDICOES_PAGAMENTO),
      status: rnd() > 0.1 ? "Ativo" : "Inativo",
      criadoEm,
      atualizadoEm: criadoEm,
    };
  });
}

export function seedUsuarios(n = 10): Usuario[] {
  const rnd = seededRandom(41007);
  return Array.from({ length: n }, (_, i) => {
    const nome = PESSOAS[(i + 5) % PESSOAS.length];
    const criadoEm = pastDate(rnd, 600);
    const primeiro = nome.split(" ")[0].toLowerCase();
    const ultimo = nome.split(" ").at(-1)!.toLowerCase();
    return {
      id: id("USR", i + 1),
      nome,
      email: `${primeiro}.${ultimo}@educaerp.com.br`,
      login: `${primeiro}.${ultimo}`,
      perfil: PERFIS_USUARIO_CADASTRO[i % PERFIS_USUARIO_CADASTRO.length],
      departamento: pick(rnd, DEPARTAMENTOS),
      status: rnd() > 0.1 ? "Ativo" : "Inativo",
      criadoEm,
      atualizadoEm: criadoEm,
    };
  });
}

export function seedProdutos(fornecedores: Fornecedor[], locais: LocalEstoque[], n = 30): Produto[] {
  const rnd = seededRandom(41008);
  const nomes = [
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
  return Array.from({ length: n }, (_, i) => {
    const criadoEm = pastDate(rnd, 250);
    const estoqueMinimo = int(rnd, 10, 200);
    const estoqueMaximo = estoqueMinimo + int(rnd, 200, 2000);
    return {
      id: id("PRD", i + 1),
      codigo: id("PRD", i + 1),
      sku: `SKU-${digits(rnd, 6)}`,
      descricao: nomes[i % nomes.length],
      descricaoCurta: nomes[i % nomes.length].split(" ").slice(0, 2).join(" "),
      categoria: pick(rnd, CATEGORIAS_PRODUTO),
      subcategoria: pick(rnd, SUBCATEGORIAS_PRODUTO),
      unidade: pick(rnd, UNIDADES_PRODUTO),
      codigoBarras: `789${digits(rnd, 10)}`,
      ncm: `${digits(rnd, 4)}.${digits(rnd, 2)}.${digits(rnd, 2)}`,
      peso: Number((rnd() * 48 + 0.1).toFixed(2)),
      altura: Number((rnd() * 90 + 5).toFixed(1)),
      largura: Number((rnd() * 90 + 5).toFixed(1)),
      comprimento: Number((rnd() * 120 + 5).toFixed(1)),
      estoqueMinimo,
      estoqueMaximo,
      pontoReposicao: estoqueMinimo + Math.round((estoqueMaximo - estoqueMinimo) * 0.2),
      localizacaoPadrao: pick(rnd, locais).codigoLocal,
      fornecedorId: pick(rnd, fornecedores).id,
      loteControlado: rnd() > 0.6,
      validadeControlada: rnd() > 0.75,
      status: rnd() > 0.1 ? "Ativo" : "Inativo",
      criadoEm,
      atualizadoEm: criadoEm,
    };
  });
}
