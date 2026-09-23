// Lógica pura das listas (src/lib/list/query.ts): estado na URL,
// busca/filtro/ordenação/paginação locais e CSV.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PAGE_SIZE, applyClientQuery, compareValues, isOverdue, pageCount, parseListState, serializeListState, toCsv } from "@/lib/list/query";

describe("estado da lista na URL", () => {
  test("lê parâmetros e ignora tamanhos inválidos", () => {
    const s = parseListState(new URLSearchParams("q=abc&page=3&size=50&sort=code&dir=desc&status=open&x=1"), ["status"]);
    assert.deepEqual(s, { q: "abc", page: 3, pageSize: 50, sort: "code", dir: "desc", filters: { status: "open" } });
    assert.equal(parseListState(new URLSearchParams("size=7&page=-2"), []).pageSize, DEFAULT_PAGE_SIZE);
    assert.equal(parseListState(new URLSearchParams("page=-2"), []).page, 1);
  });
  test("serializa só o que difere do padrão e preserva parâmetros alheios", () => {
    const current = new URLSearchParams("periodo=30d&status=old");
    const qs = serializeListState(current, { q: " x ", page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: null, dir: "asc", filters: { status: "" } }, ["status"]);
    assert.equal(qs, "?periodo=30d&q=x");
  });
});

describe("consulta local", () => {
  const rows = [
    { id: "1", name: "Álvaro", value: 10, status: "A" },
    { id: "2", name: "bruno", value: 2, status: "B" },
    { id: "3", name: "Carla", value: 30, status: "A" },
  ];
  const config = {
    searchText: (r: (typeof rows)[number]) => r.name,
    sortValue: (r: (typeof rows)[number], id: string) => (r as Record<string, unknown>)[id],
    predicates: { status: (r: (typeof rows)[number], v: string) => r.status === v },
  };
  test("busca sem acento e sem caixa", () => {
    const out = applyClientQuery(rows, { q: "alvaro", page: 1, pageSize: 10, sort: null, dir: "asc", filters: {} }, config);
    assert.deepEqual(out.rows.map((r) => r.id), ["1"]);
  });
  test("filtra, ordena e pagina", () => {
    const out = applyClientQuery(rows, { q: "", page: 1, pageSize: 1, sort: "value", dir: "desc", filters: { status: "A" } }, config);
    assert.equal(out.total, 2);
    assert.deepEqual(out.rows.map((r) => r.id), ["3"]);
  });
  test("vazios vão para o fim; números como números", () => {
    assert.ok(compareValues(null, "a") > 0);
    assert.ok(compareValues("10", "9") > 0);
    assert.ok(compareValues("b", "A") > 0);
  });
  test("contagem de páginas nunca é zero", () => {
    assert.equal(pageCount(0, 25), 1);
    assert.equal(pageCount(51, 25), 3);
  });
});

describe("CSV e atraso", () => {
  test("separador ; com BOM e escape", () => {
    const csv = toCsv(["Nome", "Obs"], [["A;B", 'diz "oi"'], [null, 3]]);
    assert.ok(csv.startsWith("﻿"));
    assert.equal(csv.slice(1), 'Nome;Obs\r\n"A;B";"diz ""oi"""\r\n;3');
  });
  test("vencido só antes de hoje", () => {
    const today = new Date(2026, 8, 23);
    assert.equal(isOverdue("2026-09-22", today), true);
    assert.equal(isOverdue("2026-09-23", today), false);
    assert.equal(isOverdue(null, today), false);
  });
});
