import { test } from "node:test";
import assert from "node:assert/strict";
import { produtosRepository } from "@/lib/cadastros/repository";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("hydrate(): após falha, uma nova chamada refaz a requisição (bug do 'Tentar novamente')", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) {
      return jsonResponse(
        { success: false, error: { code: "INTERNAL_ERROR", message: "falha simulada" } },
        500
      );
    }
    return jsonResponse({ success: true, data: [] }, 200);
  }) as typeof fetch;

  try {
    await assert.rejects(() => produtosRepository.hydrate());
    assert.equal(calls, 1, "a primeira chamada a hydrate() deve disparar exatamente 1 requisição");

    // Esta é a chamada equivalente ao clique em "Tentar novamente": antes da
    // correção, a promise rejeitada ficava em cache e esta chamada retornava
    // o mesmo erro sem nunca tocar a rede (calls continuaria em 1).
    await produtosRepository.hydrate();
    assert.equal(calls, 2, "hydrate() após uma falha anterior deve disparar uma NOVA requisição");

    // Uma vez bem-sucedida, chamadas seguintes reaproveitam o resultado —
    // não há necessidade de refazer a requisição quando não há falha.
    await produtosRepository.hydrate();
    assert.equal(calls, 2, "hydrate() após sucesso não precisa refazer a requisição");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
