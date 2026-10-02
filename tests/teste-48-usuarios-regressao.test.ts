// Regressões da rodada de teste com 48 usuários em 7 empresas
// (docs/homologacao/RELATORIO-TESTE-48-USUARIOS-7-EMPRESAS.md).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { codeFromName } from "@/lib/database/mappers";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("R48-B8 — categoria e marca de produto recebem código ao serem criadas", () => {
  it("deriva o código do nome, sem acento e em maiúsculas", () => {
    assert.equal(codeFromName("Matéria-prima"), "MATERIA-PRIMA");
    assert.equal(codeFromName("Higiene & Limpeza"), "HIGIENE-LIMPEZA");
    assert.equal(codeFromName("  EPI  "), "EPI");
    assert.equal(codeFromName("Sinalização"), "SINALIZACAO");
  });
  it("respeita o tamanho máximo sem terminar em hífen", () => {
    const code = codeFromName("Equipamentos de proteção individual descartáveis", 20);
    assert.ok(code.length <= 20);
    assert.ok(!code.endsWith("-"));
  });
  it("nunca devolve código vazio (a coluna é obrigatória)", () => {
    assert.equal(codeFromName(""), "SEM-NOME");
    assert.equal(codeFromName("***"), "SEM-NOME");
  });
  it("os repositórios de categoria e de marca preenchem o código na criação", () => {
    const src = read("src/lib/database/repositories.ts");
    for (const table of ["product_categories", "product_brands"]) {
      const block = src.slice(src.indexOf(`table: "${table}"`), src.indexOf(`table: "${table}"`) + 600);
      assert.match(block, /createDefaults: \(item\) => \(\{ code: codeFromName\(item\.nome/, `${table} sem createDefaults`);
    }
    assert.match(read("src/lib/database/table.ts"), /config\.createDefaults\?\.\(input\)/);
  });
});

describe("R48 — duplicidade concorrente devolve a mensagem certa", () => {
  it("NF-e gerada 2× do mesmo pedido não fala em CPF/CNPJ", async () => {
    const { translatePostgresError } = await import("@/lib/database/errors");
    const e = translatePostgresError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "fiscal_documents_source_unique"',
      details: "Key (company_id, source_type, source_id)=(a, sales_order, b) already exists.",
    });
    assert.equal(e.status, 409);
    assert.doesNotMatch(e.message, /CPF|CNPJ/);
    assert.match(e.message, /já foi gerado a partir desta origem/);
  });
  it("CNPJ duplicado continua com a mensagem de documento", async () => {
    const { translatePostgresError } = await import("@/lib/database/errors");
    const e = translatePostgresError({ code: "23505", message: 'duplicate key value violates unique constraint "customers_company_id_document_key"', details: "Key (company_id, document)=(a, 123) already exists." });
    assert.match(e.message, /CPF\/CNPJ/);
  });
  it("código duplicado (categoria/marca) não vira CPF/CNPJ", async () => {
    const { translatePostgresError } = await import("@/lib/database/errors");
    const e = translatePostgresError({ code: "23505", message: 'duplicate key value violates unique constraint "product_categories_company_id_code_key"', details: "Key (company_id, code)=(a, EPI) already exists." });
    assert.match(e.message, /código/);
  });
});

describe("R48-A — dois usuários salvando o mesmo cadastro (bloqueio otimista)", () => {
  it("mesma versão é aceita (texto igual ou mesmo instante)", async () => {
    const { sameVersion } = await import("@/lib/database/errors");
    assert.equal(sameVersion("2026-10-02T18:00:00.123456+00:00", "2026-10-02T18:00:00.123456+00:00"), true);
    assert.equal(sameVersion("2026-10-02T18:00:00.123+00:00", "2026-10-02T18:00:00.123Z"), true);
  });
  it("versão diferente, vazia ou inválida é conflito", async () => {
    const { sameVersion } = await import("@/lib/database/errors");
    assert.equal(sameVersion("2026-10-02T18:00:01.000Z", "2026-10-02T18:00:00.000Z"), false);
    assert.equal(sameVersion(null, "2026-10-02T18:00:00.000Z"), false);
    assert.equal(sameVersion("2026-10-02T18:00:00.000Z", "ontem"), false);
  });
  it("conflito responde 409 com instrução em português", async () => {
    const { staleRecordError } = await import("@/lib/database/errors");
    const e = staleRecordError();
    assert.equal(e.status, 409);
    assert.match(e.message, /alterado por outra pessoa/);
    assert.match(e.message, /abra de novo/);
  });
  it("o PATCH genérico repassa a versão do formulário e a gravação é condicional", () => {
    assert.match(read("src/lib/api/handlers.ts"), /table\.update\(companyId, id, parsed\.data as never, actor, \{ expectedUpdatedAt \}\)/);
    const table = read("src/lib/database/table.ts");
    assert.match(table, /if \(expected\) query = query\.eq\("updated_at", before\.atualizadoEm\)/);
    assert.match(table, /if \(expected && !sameVersion\(before\.atualizadoEm, expected\)\) throw staleRecordError\(\)/);
  });
});

describe("R48 — pedido/orçamento com desconto maior que o valor (total negativo)", () => {
  const item = { productId: "00000000-0000-4000-8000-000000000001", description: "Item", quantity: 1, unitPrice: 10 };
  const customerId = "00000000-0000-4000-8000-000000000002";
  it("recusa desconto do item acima de quantidade × preço", async () => {
    const { createSalesOrderSchema } = await import("@/lib/validations/commercial");
    const r = createSalesOrderSchema.safeParse({ customerId, items: [{ ...item, discount: 500 }] });
    assert.equal(r.success, false);
    assert.match(r.error!.issues[0].message, /desconto do item não pode ser maior/);
  });
  it("aceita desconto igual ao valor do item (total zero) e desconto parcial", async () => {
    const { createSalesOrderSchema } = await import("@/lib/validations/commercial");
    assert.equal(createSalesOrderSchema.safeParse({ customerId, items: [{ ...item, quantity: 3, discount: 30 }] }).success, true);
    assert.equal(createSalesOrderSchema.safeParse({ customerId, items: [{ ...item, discount: 2.5 }] }).success, true);
  });
  it("recusa desconto do cabeçalho maior que itens + frete", async () => {
    const { createSalesOrderSchema, createSalesQuoteSchema } = await import("@/lib/validations/commercial");
    assert.equal(createSalesOrderSchema.safeParse({ customerId, discount: 11, freightCost: 0, items: [item] }).success, false);
    assert.equal(createSalesOrderSchema.safeParse({ customerId, discount: 11, freightCost: 5, items: [item] }).success, true);
    assert.equal(createSalesQuoteSchema.safeParse({ customerId, discount: 50, items: [item] }).success, false);
  });
  it("pedido a partir de orçamento (sem itens) continua aceito", async () => {
    const { createSalesOrderSchema } = await import("@/lib/validations/commercial");
    assert.equal(createSalesOrderSchema.safeParse({ customerId, salesQuoteId: "00000000-0000-4000-8000-000000000003", discount: 5 }).success, true);
  });
});

describe("R48 — erros provocados: sem HTTP 500 nem texto técnico em inglês", () => {
  it("campo obrigatório vazio responde em português, com o nome do campo", async () => {
    await import("@/lib/validations/zod-messages");
    const { createSalesOrderSchema } = await import("@/lib/validations/commercial");
    const r = createSalesOrderSchema.safeParse({ items: [{ productId: "00000000-0000-4000-8000-000000000001", description: "x", quantity: 1, unitPrice: 1 }] });
    assert.equal(r.success, false);
    const msg = r.error!.issues[0].message;
    assert.doesNotMatch(msg, /Invalid input|expected|received/);
    assert.match(msg, /cliente/);
  });
  it("número em texto (\"dez reais\") pede número em português", async () => {
    await import("@/lib/validations/zod-messages");
    const { productSchema } = await import("@/lib/validations/cadastros");
    const r = productSchema.safeParse({ codigo: "X", descricao: "X", categoria: "C", unidade: "UN", precoVenda: "dez reais" });
    assert.equal(r.success, false);
    const msg = r.error!.issues.find((i) => i.path.includes("precoVenda"))!.message;
    assert.doesNotMatch(msg, /NaN|expected/);
    assert.match(msg, /preço de venda/);
  });
  it("preço negativo é recusado na validação (não chega ao banco)", async () => {
    const { productSchema } = await import("@/lib/validations/cadastros");
    const r = productSchema.safeParse({ codigo: "X", descricao: "X", categoria: "C", unidade: "UN", precoVenda: -5 });
    assert.equal(r.success, false);
    assert.match(r.error!.issues[0].message, /preço de venda não pode ser negativo/);
  });
  it("transferência para o mesmo local é recusada na validação", async () => {
    const { createTransferSchema } = await import("@/lib/validations/inventory");
    const loc = "00000000-0000-4000-8000-000000000009";
    const r = createTransferSchema.safeParse({ fromLocationId: loc, toLocationId: loc, items: [{ productId: "00000000-0000-4000-8000-000000000001", quantity: 1 }] });
    assert.equal(r.success, false);
    assert.match(r.error!.issues[0].message, /origem e o de destino precisam ser diferentes/);
  });
  it("erros de formato/faixa do banco viram 4xx com instrução", async () => {
    const { translatePostgresError } = await import("@/lib/database/errors");
    assert.equal(translatePostgresError({ code: "22P02", message: 'invalid input syntax for type uuid: "abc"' }).status, 404);
    assert.equal(translatePostgresError({ code: "22003", message: "numeric field overflow" }).status, 422);
    assert.match(translatePostgresError({ code: "22008", message: "date/time field value out of range" }).message, /Data inválida/);
    assert.match(translatePostgresError({ code: "23514", message: 'new row for relation "stock_transfers" violates check constraint "stock_transfers_check"' }).message, /origem e o de destino/);
    assert.match(translatePostgresError({ code: "23514", message: 'violates check constraint "products_sale_price_check"' }).message, /não podem ser negativos/);
  });
});

describe("R48 — nomes com tamanho máximo", () => {
  it("cliente com nome de 5.000 caracteres é recusado com mensagem clara", async () => {
    const { customerSchema } = await import("@/lib/validations/cadastros");
    const r = customerSchema.safeParse({ tipo: "Pessoa Jurídica", nome: "X".repeat(5000), documento: "" });
    assert.equal(r.success, false);
    assert.ok(r.error!.issues.some((i) => /no máximo 200 caracteres/.test(i.message)));
  });
  it("nomes reais continuam aceitos", async () => {
    const { productSchema } = await import("@/lib/validations/cadastros");
    assert.equal(productSchema.safeParse({ codigo: "LE-042", descricao: "Coletor perfurocortante 13 L", categoria: "C", unidade: "UN" }).success, true);
  });
});

describe("R48 — 404 do cadastro em português", () => {
  it("o GET por ID usa o rótulo da entidade, não o nome da rota em inglês", () => {
    assert.match(read("src/lib/api/handlers.ts"), /if \(!item\) throw notFoundError\(table\.entityLabel\)/);
    assert.match(read("src/lib/database/table.ts"), /entityLabel: config\.entityLabel \}/);
  });
});

describe("R48 — Papéis e Usuários não varrem os vínculos de todas as empresas", () => {
  it("papéis: role_permissions e user_roles filtrados pelos papéis da empresa", () => {
    const src = read("src/lib/api/admin-handlers.ts");
    assert.match(src, /from\("role_permissions"\)\.select\("role_id, permissions\(code\)"\)\.in\("role_id", roleIds\)/);
    assert.match(src, /from\("user_roles"\)\.select\("role_id"\)\.in\("role_id", roleIds\)/);
    assert.match(src, /from\("user_roles"\)\.select\("user_id, role_id"\)\.in\("user_id", userIds\)/);
    assert.doesNotMatch(src, /from\("role_permissions"\)\.select\("role_id, permissions\(code\)"\),/);
  });
});

describe("R48 — telas em português (papéis, CFOP, auditoria, início)", () => {
  it("matriz de permissões: recursos e ações em português", async () => {
    const { resourceLabel, actionLabel } = await import("@/lib/permission-labels");
    assert.equal(resourceLabel("company_modules"), "Módulos da empresa");
    assert.equal(resourceLabel("rbac"), "Papéis e permissões");
    assert.equal(resourceLabel("audit"), "Auditoria");
    assert.equal(actionLabel("configure", "Configure"), "Configurar");
    assert.equal(actionLabel("view", "Consultar"), "Consultar");
    assert.doesNotMatch(read("src/app/app/admin/roles/page.tsx"), /humanize\(resource\)/);
  });
  it("todo recurso do catálogo usado nas migrações tem rótulo em português", async () => {
    const { RESOURCE_LABELS } = await import("@/lib/permission-labels");
    for (const r of ["accounts_payable", "fiscal_ncms", "stock", "users", "warehouse_locations", "purchase_requests", "reports"]) assert.ok(RESOURCE_LABELS[r], r);
  });
  it("CFOP mostra Entrada/Saída e a abrangência por extenso", () => {
    const src = read("src/app/app/(erp)/fiscal/cfop/page.tsx");
    assert.match(src, /SAIDA: "Saída"/);
    assert.match(src, /INTERNAL: "Dentro do estado"/);
  });
  it("auditoria traduz transferências de estoque", async () => {
    assert.match(read("src/lib/audit-labels.ts"), /stock_transfers: "Transferência entre locais"/);
  });
  it("início: bloco executivo só para quem tem reports.view e controlling.view; 403 sem botão de tentar de novo", () => {
    assert.match(read("src/lib/dashboard/metrics.ts"), /alsoRequires: \["controlling\.view"\]/);
    assert.match(read("src/components/dashboard/AreaDashboard.tsx"), /const execOk = reportAllowed\(REPORTS\.executive, can\)/);
    assert.match(read("src/components/dashboard/AreaDashboard.tsx"), /\{execOk && <MonthlyTrend/);
    const blocks = read("src/components/dashboard/ReportBlocks.tsx");
    assert.match(blocks, /current\.error === FORBIDDEN_MESSAGE/);
    assert.match(blocks, /kind="no-permission"/);
  });
});

describe("R48 — reportAllowed considera o que o banco também exige", () => {
  it("executivo exige reports.view e controlling.view", async () => {
    const { REPORTS, reportAllowed } = await import("@/lib/dashboard/metrics");
    const perms = new Set(["reports.view", "purchase_reports.view"]);
    assert.equal(reportAllowed(REPORTS.executive, (c) => perms.has(c)), false);
    perms.add("controlling.view");
    assert.equal(reportAllowed(REPORTS.executive, (c) => perms.has(c)), true);
  });
});
