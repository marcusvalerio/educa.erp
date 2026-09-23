import clsx, { type ClassValue } from "clsx";

// Junta classes condicionalmente. Sem tailwind-merge de propósito: os
// componentes do Design System expõem variantes em vez de depender de
// sobrescrita de classes utilitárias conflitantes.
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
