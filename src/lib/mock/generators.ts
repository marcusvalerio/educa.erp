import { seededRandom, pick, int, code, recentDate, futureDate, formatDate, formatCurrency } from "./rng";
import {
  EMPRESAS,
  TRANSPORTADORAS,
  PESSOAS,
  CIDADES,
  PRODUTOS,
  CATEGORIAS_PRODUTO,
  UNIDADES,
  PERFIS_USUARIO,
  MODELOS_VEICULO,
  TIPOS_VEICULO,
  LOCAIS_ESTOQUE,
  CENTROS_CUSTO,
  NCM_LIST,
  CFOP_LIST,
  IMPOSTOS_LIST,
  ACOES_AUDITORIA,
} from "./pools";

export type Row = Record<string, string | number>;

const STATUS_CADASTRO = ["Ativo", "Ativo", "Ativo", "Inativo", "Pendente"] as const;
const STATUS_COMERCIAL = ["Em aberto", "Aprovado", "Faturado", "Concluído", "Cancelado"] as const;
const STATUS_SUPRIMENTOS = ["Em cotação", "Aprovado", "Enviado", "Recebido", "Cancelado"] as const;
const STATUS_LOGISTICA = ["Pendente", "Em andamento", "Concluído", "Atrasado"] as const;
const STATUS_FINANCEIRO = ["Em aberto", "Pago", "Vencido", "Agendado"] as const;
const STATUS_FISCAL = ["Autorizada", "Pendente", "Cancelada", "Rejeitada"] as const;

export function genProdutos(seed: number, n = 18): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    codigo: code("PRD", i + 1),
    produto: pick(rnd, PRODUTOS),
    categoria: pick(rnd, CATEGORIAS_PRODUTO),
    unidade: pick(rnd, UNIDADES),
    estoque: int(rnd, 0, 4200),
    status: pick(rnd, STATUS_CADASTRO),
  }));
}

export function genPessoasJuridicas(seed: number, n = 16, pool: readonly string[] = EMPRESAS): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    codigo: code("PJ", i + 1),
    nome: pick(rnd, pool),
    cidade: pick(rnd, CIDADES),
    contato: pick(rnd, PESSOAS),
    telefone: `(${int(rnd, 11, 91)}) 9${int(rnd, 1000, 9999)}-${int(rnd, 1000, 9999)}`,
    status: pick(rnd, STATUS_CADASTRO),
  }));
}

export function genMotoristas(seed: number, n = 14): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    codigo: code("MOT", i + 1),
    nome: pick(rnd, PESSOAS),
    cnh: `${pick(rnd, ["A", "B", "AB", "C", "D", "E"])}`,
    telefone: `(${int(rnd, 11, 91)}) 9${int(rnd, 1000, 9999)}-${int(rnd, 1000, 9999)}`,
    veiculoVinculado: pick(rnd, MODELOS_VEICULO),
    status: pick(rnd, STATUS_CADASTRO),
  }));
}

export function genUsuarios(seed: number, n = 14): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => {
    const nome = pick(rnd, PESSOAS);
    return {
      codigo: code("USR", i + 1),
      nome,
      email: `${nome.split(" ")[0].toLowerCase()}.${nome.split(" ").at(-1)!.toLowerCase()}@educaerp.com.br`,
      perfil: pick(rnd, PERFIS_USUARIO),
      status: pick(rnd, STATUS_CADASTRO),
    };
  });
}

export function genVeiculos(seed: number, n = 14): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    codigo: code("VEI", i + 1),
    placa: `${pick(rnd, ["ABC", "BRA", "LOG", "TRK", "MVX"])}-${int(rnd, 1000, 9999)}`,
    modelo: pick(rnd, MODELOS_VEICULO),
    tipo: pick(rnd, TIPOS_VEICULO),
    capacidadeKg: int(rnd, 1500, 32000),
    status: pick(rnd, STATUS_CADASTRO),
  }));
}

export function genLocaisEstoque(seed: number, n = 8): Row[] {
  const rnd = seededRandom(seed);
  return LOCAIS_ESTOQUE.slice(0, n).map((local, i) => ({
    codigo: code("LOC", i + 1),
    local,
    tipo: pick(rnd, ["Armazém", "Doca", "Área de quarentena", "Pátio externo"]),
    capacidadeOcupada: `${int(rnd, 20, 98)}%`,
    responsavel: pick(rnd, PESSOAS),
    status: pick(rnd, STATUS_CADASTRO),
  }));
}

export function genDocumentosComerciais(seed: number, n = 20, prefix = "ORC"): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    numero: code(prefix, 1000 + i, 4),
    cliente: pick(rnd, EMPRESAS),
    data: formatDate(recentDate(rnd, 45)),
    valor: formatCurrency(int(rnd, 850, 185000)),
    vendedor: pick(rnd, PESSOAS),
    status: pick(rnd, STATUS_COMERCIAL),
  }));
}

export function genDocumentosCompra(seed: number, n = 18, prefix = "SOL"): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    numero: code(prefix, 500 + i, 4),
    fornecedor: pick(rnd, EMPRESAS),
    data: formatDate(recentDate(rnd, 30)),
    valor: formatCurrency(int(rnd, 400, 92000)),
    comprador: pick(rnd, PESSOAS),
    status: pick(rnd, STATUS_SUPRIMENTOS),
  }));
}

export function genAgendamentos(seed: number, n = 14): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    numero: code("AGE", 200 + i, 4),
    fornecedor: pick(rnd, EMPRESAS),
    transportadora: pick(rnd, TRANSPORTADORAS),
    dataPrevista: formatDate(futureDate(rnd, 20)),
    janela: `${pick(rnd, ["08:00", "10:00", "13:00", "15:00"])} - ${pick(rnd, ["10:00", "12:00", "15:00", "17:00"])}`,
    status: pick(rnd, ["Confirmado", "Aguardando confirmação", "Reagendado", "Concluído"]),
  }));
}

export function genOperacaoLogistica(seed: number, n = 20, prefix = "REC", pool: readonly string[] = EMPRESAS): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    numero: code(prefix, 3000 + i, 4),
    referencia: pick(rnd, pool),
    data: formatDate(recentDate(rnd, 25)),
    itens: int(rnd, 1, 48),
    responsavel: pick(rnd, PESSOAS),
    status: pick(rnd, STATUS_LOGISTICA),
  }));
}

export function genEstoque(seed: number, n = 20): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    codigo: code("PRD", i + 1),
    produto: pick(rnd, PRODUTOS),
    local: pick(rnd, LOCAIS_ESTOQUE),
    quantidade: int(rnd, 0, 3800),
    unidade: pick(rnd, UNIDADES),
    status: pick(rnd, ["Disponível", "Disponível", "Reservado", "Baixo estoque", "Bloqueado"]),
  }));
}

export function genEnderecamento(seed: number, n = 18): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    codigo: code("END", i + 1),
    produto: pick(rnd, PRODUTOS),
    endereco: `${pick(rnd, ["A", "B", "C", "D"])}-${int(rnd, 1, 12)}-${int(rnd, 1, 5)}`,
    local: pick(rnd, LOCAIS_ESTOQUE),
    quantidade: int(rnd, 0, 900),
    status: pick(rnd, ["Ocupado", "Ocupado", "Disponível", "Bloqueado"]),
  }));
}

export function genInventario(seed: number, n = 18): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => {
    const sistema = int(rnd, 0, 2000);
    const divergencia = int(rnd, -15, 15);
    const contado = Math.max(0, sistema + divergencia);
    return {
      codigo: code("INV", i + 1),
      produto: pick(rnd, PRODUTOS),
      local: pick(rnd, LOCAIS_ESTOQUE),
      quantidadeSistema: sistema,
      quantidadeContada: contado,
      status: sistema === contado ? "Conferido" : pick(rnd, ["Divergência", "Em contagem"]),
    };
  });
}

export function genMovimentacoes(seed: number, n = 20): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    numero: code("MOV", 5000 + i, 4),
    tipo: pick(rnd, ["Entrada", "Saída", "Transferência", "Ajuste"]),
    produto: pick(rnd, PRODUTOS),
    quantidade: int(rnd, 1, 500),
    data: formatDate(recentDate(rnd, 20)),
    status: pick(rnd, ["Concluído", "Concluído", "Pendente", "Cancelado"]),
  }));
}

export function genFinanceiro(seed: number, n = 20, prefix = "CP"): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    documento: code(prefix, 4000 + i, 4),
    favorecido: pick(rnd, EMPRESAS),
    vencimento: formatDate(futureDate(rnd, 40)),
    valor: formatCurrency(int(rnd, 300, 78000)),
    centroCusto: pick(rnd, CENTROS_CUSTO),
    status: pick(rnd, STATUS_FINANCEIRO),
  }));
}

export function genFiscalDocs(seed: number, n = 20, prefix = "NF"): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    numero: code(prefix, 8000 + i, 4),
    serie: pick(rnd, ["1", "2", "3"]),
    destinatario: pick(rnd, EMPRESAS),
    data: formatDate(recentDate(rnd, 35)),
    valor: formatCurrency(int(rnd, 500, 145000)),
    status: pick(rnd, STATUS_FISCAL),
  }));
}

export function genNcm(): Row[] {
  return NCM_LIST.map((n, i) => ({
    codigo: n.codigo,
    descricao: n.descricao,
    status: i % 5 === 0 ? "Revisão pendente" : "Ativo",
  }));
}

export function genCfop(): Row[] {
  return CFOP_LIST.map((c, i) => ({
    codigo: c.codigo,
    descricao: c.descricao,
    tipo: c.codigo.startsWith("1") || c.codigo.startsWith("2") || c.codigo.startsWith("3") ? "Entrada" : "Saída",
    status: i % 6 === 0 ? "Revisão pendente" : "Ativo",
  }));
}

export function genImpostos(): Row[] {
  return IMPOSTOS_LIST.map((t) => ({
    imposto: t.nome,
    aliquotaPadrao: t.aliquota,
    esfera: t.nome === "ISS" ? "Municipal" : t.nome === "ICMS" || t.nome === "ICMS-ST" ? "Estadual" : "Federal",
    status: "Ativo",
  }));
}

export function genRelatorios(seed: number, n = 10): Row[] {
  const rnd = seededRandom(seed);
  const nomes = [
    "Desempenho de Vendas Mensal",
    "Giro de Estoque por Categoria",
    "Contas a Pagar por Vencimento",
    "Contas a Receber em Aberto",
    "Produtividade de Picking",
    "Ocupação de Armazém",
    "Indicadores de Compras",
    "Devoluções por Motivo",
    "Custos por Centro de Custo",
    "Auditoria de Acessos",
  ];
  return nomes.slice(0, n).map((nome, i) => ({
    codigo: code("REL", i + 1, 3),
    relatorio: nome,
    categoria: pick(rnd, ["Comercial", "Logística", "Financeiro", "Suprimentos", "Gestão"]),
    geradoEm: formatDate(recentDate(rnd, 20)),
    status: pick(rnd, ["Disponível", "Disponível", "Processando"]),
  }));
}

export function genAuditoria(seed: number, n = 20): Row[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: n }, (_, i) => ({
    codigo: code("LOG", 9000 + i, 4),
    usuario: pick(rnd, PESSOAS),
    acao: pick(rnd, ACOES_AUDITORIA),
    modulo: pick(rnd, ["Comercial", "Suprimentos", "Logística", "Financeiro", "Fiscal", "Cadastros"]),
    data: formatDate(recentDate(rnd, 15)),
    status: pick(rnd, ["Concluído", "Concluído", "Falhou"]),
  }));
}

export function genParametros(): Row[] {
  return [
    { parametro: "Casas decimais para quantidade", valor: "2", categoria: "Estoque", status: "Ativo" },
    { parametro: "Permitir estoque negativo", valor: "Não", categoria: "Estoque", status: "Ativo" },
    { parametro: "Moeda padrão", valor: "BRL", categoria: "Financeiro", status: "Ativo" },
    { parametro: "Regime tributário padrão", valor: "Lucro Presumido", categoria: "Fiscal", status: "Ativo" },
    { parametro: "Aprovação obrigatória de pedidos", valor: "Sim", categoria: "Suprimentos", status: "Ativo" },
    { parametro: "Prazo padrão de entrega (dias)", valor: "7", categoria: "Logística", status: "Ativo" },
    { parametro: "Tempo de sessão (min)", valor: "60", categoria: "Sistema", status: "Ativo" },
  ];
}

export function genPermissoes(): Row[] {
  return PERFIS_USUARIO.map((perfil, i) => ({
    perfil,
    modulos: i === 0 ? "Todos os módulos" : ["Comercial, Cadastros", "Suprimentos, Cadastros", "Comercial, Financeiro", "Financeiro, Fiscal", "Fiscal, Gestão", "Gestão, Configurações"][i - 1] ?? "Cadastros",
    nivel: i === 0 ? "Total" : "Restrito",
    status: "Ativo",
  }));
}
