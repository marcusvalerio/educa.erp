import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { EnvironmentBadge } from "@/components/shell/EnvironmentBadge";
import { isHomologation } from "@/lib/environment";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

// Tipografia servida pelo próprio app (sem CDN; funciona offline após o
// build). Instrument Sans para interface e dados (dígitos tabulares via
// .tabular-nums/.num), Instrument Serif só nos momentos editoriais
// (saudação do Início, login) e JetBrains Mono para códigos. Licenças OFL
// em src/app/fonts/.
const sans = localFont({
  src: [
    { path: "./fonts/instrument-sans-latin-wght-normal.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/instrument-sans-latin-ext-wght-normal.woff2", weight: "400 700", style: "normal" },
  ],
  variable: "--font-instrument-sans",
  display: "swap",
});

const serif = localFont({
  src: [
    { path: "./fonts/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument-serif",
  display: "swap",
});

const jetbrains = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  variable: "--font-jetbrains",
  display: "swap",
});

// Em homologação (APP_ENV=homologacao) a aba do navegador também avisa.
const TITLE_SUFFIX = isHomologation() ? " · HOMOLOGAÇÃO" : "";

export const metadata: Metadata = {
  title: { default: `EDUCA.ERP${TITLE_SUFFIX}`, template: `%s · EDUCA.ERP${TITLE_SUFFIX}` },
  description: "EDUCA.ERP — gestão empresarial integrada: operação, finanças, fiscal e governança.",
  applicationName: "EDUCA.ERP",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceeef" },
    { media: "(prefers-color-scheme: dark)", color: "#090705" },
  ],
};

// Evita "flash" de tema errado antes da hidratação: aplica a escolha
// explícita (claro/escuro) antes do primeiro paint. "Sistema" é resolvido
// só por CSS (prefers-color-scheme), sem atributo.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var v=window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(v==="dark"||v==="light")document.documentElement.setAttribute("data-theme",v);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${serif.variable} ${jetbrains.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="h-full">
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            {children}
            <EnvironmentBadge />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
