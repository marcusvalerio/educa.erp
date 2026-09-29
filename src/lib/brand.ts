// Identidade do produto — fonte única para textos, títulos e metadados.
//
// O nome oficial é ATLAS.ERP, sem expansão. É um ERP empresarial, modular e
// generalista. Nomes TÉCNICOS antigos (cookie `educa_session`, GUC
// `educa.auth_link`, chaves `educa-*` do navegador, banco `educa`, projetos
// Neon/Vercel, variável EDUCA_CUTOVER_NEON_CONFIRMADO) continuam como estão:
// são identificadores de compatibilidade, invisíveis para quem usa o sistema.
//
// A autoria aparece só em pontos institucionais: "Sobre o ATLAS.ERP" (menu da
// conta), rodapé da landing, metadados e ficha técnica dos manuais.

export const PRODUCT_NAME = "ATLAS.ERP";
/** As duas partes do wordmark: o nome em destaque e o sufixo em tom menor. */
export const PRODUCT_WORDMARK = { name: "ATLAS", suffix: ".ERP" } as const;
export const PRODUCT_DESCRIPTION = "ERP empresarial modular: operação, finanças, fiscal e governança em um só sistema.";
export const PRODUCT_AUTHOR = "Marcus Valério";
export const PRODUCT_CREDIT = `Criado por ${PRODUCT_AUTHOR}`;

/**
 * Símbolo "Núcleo" (grade 32×32): quatro módulos girando em torno de um
 * centro — áreas diferentes, uma base só. O centro é sempre o acento (fogo).
 * Mesma geometria em scripts/build-landing.mjs e src/app/icon.svg.
 */
export const BRAND_MARK = {
  modules: [
    [3, 3, 16, 8],
    [21, 3, 8, 16],
    [13, 21, 16, 8],
    [3, 13, 8, 16],
  ],
  core: [13, 13, 6, 6],
  radius: 1.4,
} as const;

/**
 * Versão do build (Vercel informa o commit; localmente, "local"). As variáveis
 * são lidas por nome completo: só assim o Next as grava no bundle do navegador.
 */
export function buildInfo(
  env: { NEXT_PUBLIC_BUILD_COMMIT?: string; NEXT_PUBLIC_BUILD_DATE?: string } = {
    NEXT_PUBLIC_BUILD_COMMIT: process.env.NEXT_PUBLIC_BUILD_COMMIT,
    NEXT_PUBLIC_BUILD_DATE: process.env.NEXT_PUBLIC_BUILD_DATE,
  }
) {
  const commit = (env.NEXT_PUBLIC_BUILD_COMMIT ?? "").slice(0, 7);
  const date = env.NEXT_PUBLIC_BUILD_DATE ?? "";
  return { commit: commit || "local", date };
}
