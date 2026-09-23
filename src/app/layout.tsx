import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

// Tipografia servida pelo próprio app (sem CDN; funciona offline após o
// build). Inter para interface e dados (com dígitos tabulares via
// .tabular-nums/.num), JetBrains Mono para códigos. Licenças OFL em
// src/app/fonts/.
const inter = localFont({
  src: [
    { path: "./fonts/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/inter-latin-ext-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "EDUCA.ERP", template: "%s · EDUCA.ERP" },
  description: "EDUCA.ERP — gestão empresarial integrada: operação, finanças, fiscal e governança.",
  applicationName: "EDUCA.ERP",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a08" },
  ],
};

// Evita "flash" de tema errado antes da hidratação: aplica a escolha
// explícita (claro/escuro) antes do primeiro paint. "Sistema" é resolvido
// só por CSS (prefers-color-scheme), sem atributo.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var v=window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(v==="dark"||v==="light")document.documentElement.setAttribute("data-theme",v);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${jetbrains.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="h-full">
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
