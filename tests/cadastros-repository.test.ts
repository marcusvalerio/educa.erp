// Repositório de Cadastros: o botão "Tentar novamente" chama hydrate() de
// novo — depois de uma falha, isso precisa refazer a requisição, e não
// reaproveitar a promise rejeitada que ficou em cache.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRepository } from "@/lib/cadastros/repository";
import type { BaseEntity } from "@/lib/cadastros/types";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("repositório de cadastros — hydrate e 'Tentar novamente'", () => {
  test("primeira carga falha; nova tentativa faz outra requisição e pode ter sucesso", async () => {
    const calls: string[] = [];
    const responses = [
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => Promise.resolve(json(200, { success: true, data: [{ id: "1", status: "Ativo" }] })),
    ];
    globalThis.fetch = ((input: RequestInfo | URL) => {
      calls.push(String(input));
      return responses[calls.length - 1]();
    }) as typeof fetch;

    const repo = createRepository<BaseEntity>("teste-retry");
    await assert.rejects(repo.hydrate(), /Failed to fetch/);
    assert.equal(calls.length, 1);
    assert.deepEqual(repo.list(), []);

    await repo.hydrate(); // "Tentar novamente"
    assert.equal(calls.length, 2, "a nova tentativa refaz a requisição");
    assert.deepEqual(repo.list().map((i) => i.id), ["1"]);
  });

  test("erro do servidor (envelope de erro) também libera nova tentativa", async () => {
    let n = 0;
    globalThis.fetch = (() => {
      n++;
      return Promise.resolve(n === 1 ? json(500, { success: false, error: { code: "X", message: "indisponível" } }) : json(200, { success: true, data: [] }));
    }) as typeof fetch;
    const repo = createRepository<BaseEntity>("teste-retry-500");
    await assert.rejects(repo.hydrate(), /indisponível/);
    await repo.hydrate();
    assert.equal(n, 2);
  });

  test("depois do sucesso, hydrate() continua reaproveitando a carga (sem requisição extra)", async () => {
    let n = 0;
    globalThis.fetch = (() => {
      n++;
      return Promise.resolve(json(200, { success: true, data: [] }));
    }) as typeof fetch;
    const repo = createRepository<BaseEntity>("teste-cache");
    await repo.hydrate();
    await repo.hydrate();
    await Promise.all([repo.hydrate(), repo.hydrate()]);
    assert.equal(n, 1);
  });
});
