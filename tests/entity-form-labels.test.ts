// Formulários de Cadastros: cada rótulo aponta para o seu campo (E2E NOVA
// ORBITA, P15) — clicar no rótulo foca o campo e o leitor de tela anuncia o
// nome do campo.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EntityForm } from "@/components/cadastro/EntityForm";
import { clienteForm, localEstoqueForm } from "@/lib/cadastros/forms";

function labelsAndControls(html: string) {
  const fors = [...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]);
  const ids = new Set([...html.matchAll(/<(?:input|textarea|button)[^>]*\sid="([^"]+)"/g)].map((m) => m[1]));
  return { fors, ids };
}

describe("EntityForm — rótulo associado ao campo", () => {
  for (const [nome, sections] of [["cliente", clienteForm], ["local de estoque", localEstoqueForm]] as const) {
    test(`formulário de ${nome}: todo label[for] tem um controle com o mesmo id`, () => {
      const html = renderToStaticMarkup(createElement(EntityForm, { sections, values: {}, errors: {}, mode: "create", onChange: () => {} }));
      const { fors, ids } = labelsAndControls(html);
      assert.ok(fors.length >= 5, "há rótulos");
      assert.deepEqual(fors.filter((f) => !ids.has(f)), [], "rótulos sem campo");
    });
  }

  test("erro do campo fica ligado ao controle (aria-describedby + aria-invalid)", () => {
    const html = renderToStaticMarkup(
      createElement(EntityForm, { sections: clienteForm, values: {}, errors: { nome: "Informe o nome ou razão social." }, mode: "create", onChange: () => {} })
    );
    const errorId = /<p id="([^"]+)" role="alert"/.exec(html)?.[1];
    assert.ok(errorId);
    assert.match(html, new RegExp(`<input[^>]*aria-describedby="${errorId}"[^>]*aria-invalid="true"|<input[^>]*aria-invalid="true"[^>]*aria-describedby="${errorId}"`));
  });
});
