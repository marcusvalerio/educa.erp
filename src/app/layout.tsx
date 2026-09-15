import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASTRA.ERP — Gestão Logística",
  description:
    "ASTRA.ERP — plataforma de gestão empresarial e operações logísticas.",
};

// Evita "flash" de tema errado antes da hidratação do React: lê a
// preferência salva e já aplica data-theme="dark" sincronamente, antes
// do primeiro paint. "light" e "system" não precisam de atributo (o
// default dos tokens já é claro; "system" é resolvido só por CSS via
// prefers-color-scheme, ver globals.css) — só "dark" explícito precisa
// ser forçado aqui, já que a media query não sabe da escolha do usuário.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var v=window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(v==="dark")document.documentElement.setAttribute("data-theme","dark");else if(v==="light")document.documentElement.setAttribute("data-theme","light");}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="h-full">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
