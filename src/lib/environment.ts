// Identificação do ambiente publicado. APP_ENV é definido só nas variáveis do
// Preview de homologação (Vercel); sem ele o app se comporta como sempre.
export type AppEnvironment = "producao" | "homologacao";

export function parseAppEnvironment(value: string | undefined): AppEnvironment {
  return (value ?? "").trim().toLowerCase() === "homologacao" ? "homologacao" : "producao";
}

export function appEnvironment(): AppEnvironment {
  return parseAppEnvironment(process.env.APP_ENV);
}

export function isHomologation(): boolean {
  return appEnvironment() === "homologacao";
}
