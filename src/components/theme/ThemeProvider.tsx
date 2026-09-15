"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { THEME_STORAGE_KEY, isThemePreference, resolveTheme, type ResolvedTheme, type ThemePreference } from "@/lib/theme";

// Fase 19 — Design System: preferência Claro/Escuro/Sistema, persistida
// em localStorage (preferência pessoal de exibição, não um dado de
// empresa — não usa system_settings/fn_upsert_setting, que são
// escopados por company/establishment, não por usuário/navegador).
// Configurável em "Configurações -> Aparência"
// (src/app/configuracoes/aparencia/page.tsx).

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    // localStorage indisponível (modo privado, política de cookies) —
    // cai para o default abaixo, nunca quebra a página.
  }
  return "system";
}

// Inicializadores preguiçosos (useState(() => ...)) em vez de ler no
// corpo de um efeito: evita o cascading render que um setState direto
// no efeito causaria (o tema não afeta o que este provider RENDERIZA,
// só o atributo data-theme aplicado em outro efeito abaixo — a leitura
// síncrona aqui não gera divergência de hidratação).
function initialPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  return readStoredPreference();
}

function initialSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(initialSystemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const resolved = useMemo(() => resolveTheme(preference, systemPrefersDark), [preference, systemPrefersDark]);

  useEffect(() => {
    const root = document.documentElement;
    if (preference === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", preference);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Persistência é best-effort — a preferência ainda funciona nesta
      // sessão via estado em memória mesmo se localStorage falhar.
    }
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme precisa estar dentro de <ThemeProvider>.");
  return ctx;
}
