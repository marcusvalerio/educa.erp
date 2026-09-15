// Testes de lógica pura de tema (src/lib/theme.ts, Fase 19).
//
// IMPORTANTE — o que NÃO está coberto aqui: aplicação real do atributo
// data-theme no DOM, persistência em localStorage, escuta de
// prefers-color-scheme ao vivo — isso vive em
// src/components/theme/ThemeProvider.tsx e só é verificável em um
// navegador real (sem ambiente de DOM neste runner de testes, node:test
// puro — mesma limitação de todo o projeto para testes de UI).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveTheme, isThemePreference } from "@/lib/theme";

describe("resolveTheme", () => {
  test("light sempre resolve para light, independente do sistema", () => {
    assert.equal(resolveTheme("light", true), "light");
    assert.equal(resolveTheme("light", false), "light");
  });

  test("dark sempre resolve para dark, independente do sistema", () => {
    assert.equal(resolveTheme("dark", true), "dark");
    assert.equal(resolveTheme("dark", false), "dark");
  });

  test("system segue a preferência do sistema operacional", () => {
    assert.equal(resolveTheme("system", true), "dark");
    assert.equal(resolveTheme("system", false), "light");
  });
});

describe("isThemePreference", () => {
  test("aceita os três valores válidos", () => {
    assert.equal(isThemePreference("light"), true);
    assert.equal(isThemePreference("dark"), true);
    assert.equal(isThemePreference("system"), true);
  });

  test("rejeita valores inválidos (ex.: localStorage corrompido)", () => {
    assert.equal(isThemePreference("blue"), false);
    assert.equal(isThemePreference(null), false);
    assert.equal(isThemePreference(undefined), false);
  });
});
