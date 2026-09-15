// Fase 19 — Design System: resolução de tema (Claro/Escuro/Sistema).
// Lógica pura e testável (tests/theme.test.ts) — o componente
// ThemeProvider (src/components/theme/ThemeProvider.tsx) só aplica o
// resultado no DOM e cuida de localStorage/prefers-color-scheme.

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "educa-erp-theme-preference";

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}
