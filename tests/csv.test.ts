// Testes do parser/serializador CSV (src/lib/import-export/csv.ts,
// Fase 21) — lógica real (não Zod), sem dependência de rede/banco.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv } from "@/lib/import-export/csv";

describe("parseCsv", () => {
  test("parseia cabeçalho e linhas simples", () => {
    const result = parseCsv("codigo,nome\nP1,Produto 1\nP2,Produto 2\n");
    assert.deepEqual(result.headers, ["codigo", "nome"]);
    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.rows[0], { codigo: "P1", nome: "Produto 1" });
    assert.deepEqual(result.rows[1], { codigo: "P2", nome: "Produto 2" });
  });

  test("suporta campos entre aspas com vírgula interna", () => {
    const result = parseCsv('codigo,nome\nP1,"Produto, com vírgula"\n');
    assert.equal(result.rows[0].nome, "Produto, com vírgula");
  });

  test("suporta aspas escapadas (\"\") dentro de um campo entre aspas", () => {
    const result = parseCsv('codigo,nome\nP1,"Produto ""especial"""\n');
    assert.equal(result.rows[0].nome, 'Produto "especial"');
  });

  test("suporta quebra de linha dentro de um campo entre aspas", () => {
    const result = parseCsv('codigo,descricao\nP1,"Linha 1\nLinha 2"\n');
    assert.equal(result.rows[0].descricao, "Linha 1\nLinha 2");
  });

  test("aceita CRLF", () => {
    const result = parseCsv("codigo,nome\r\nP1,Produto 1\r\n");
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].nome, "Produto 1");
  });

  test("ignora linha em branco no final do arquivo", () => {
    const result = parseCsv("codigo,nome\nP1,Produto 1\n\n");
    assert.equal(result.rows.length, 1);
  });

  test("arquivo vazio retorna headers/rows vazios", () => {
    const result = parseCsv("");
    assert.deepEqual(result.headers, []);
    assert.deepEqual(result.rows, []);
  });

  test("célula ausente numa linha mais curta vira string vazia", () => {
    const result = parseCsv("codigo,nome,sku\nP1,Produto 1\n");
    assert.equal(result.rows[0].sku, "");
  });
});

describe("toCsv", () => {
  test("serializa cabeçalho e linhas", () => {
    const csv = toCsv(["codigo", "nome"], [{ codigo: "P1", nome: "Produto 1" }]);
    assert.equal(csv, "codigo,nome\r\nP1,Produto 1\r\n");
  });

  test("escapa valores com vírgula/aspas/quebra de linha", () => {
    const csv = toCsv(["nome"], [{ nome: 'Produto, "especial"' }]);
    assert.equal(csv, 'nome\r\n"Produto, ""especial"""\r\n');
  });

  test("valor ausente vira célula vazia", () => {
    const csv = toCsv(["codigo", "nome"], [{ codigo: "P1" }]);
    assert.equal(csv, "codigo,nome\r\nP1,\r\n");
  });

  test("round-trip: parseCsv(toCsv(x)) preserva os dados", () => {
    const original = [{ codigo: "P1", nome: 'Nome com, vírgula e "aspas"' }];
    const csv = toCsv(["codigo", "nome"], original);
    const parsed = parseCsv(csv);
    assert.deepEqual(parsed.rows, original);
  });
});
