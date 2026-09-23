import type { NavLeaf, NavSection } from "@/lib/nav";

// Regras puras de navegação (testadas em tests/navigation-access.test.ts).

function segments(path: string): string[] {
  return path.split("?")[0].split("#")[0].split("/").filter(Boolean);
}

/**
 * Um href está ativo quando TODOS os seus segmentos são prefixo dos
 * segmentos da rota atual. Comparação por segmento, nunca por string:
 * "/admin" NÃO fica ativo em "/admincentral", e "/" só é ativo em "/".
 */
export function isPathActive(pathname: string, href: string, exact = false): boolean {
  const current = segments(pathname);
  const target = segments(href);
  if (target.length === 0) return current.length === 0;
  if (exact) return current.length === target.length && target.every((seg, i) => current[i] === seg);
  if (target.length > current.length) return false;
  return target.every((seg, i) => current[i] === seg);
}

export type Can = (permission: string) => boolean;

export function canAccess(permission: NavLeaf["permission"], can: Can): boolean {
  if (!permission) return true;
  if (Array.isArray(permission)) return permission.some((p) => can(p));
  return can(permission);
}

/** Seções e itens visíveis para as permissões do usuário. */
export function visibleSections(sections: NavSection[], can: Can): NavSection[] {
  const result: NavSection[] = [];
  for (const section of sections) {
    if (section.items.length === 0) {
      result.push(section);
      continue;
    }
    const items = section.items.filter((item) => canAccess(item.permission, can));
    if (items.length > 0) result.push({ ...section, items });
  }
  return result;
}

/** Item mais específico (mais segmentos) que casa com a rota. */
export function matchLeaf(sections: NavSection[], pathname: string): { section: NavSection; leaf: NavLeaf | null } | null {
  let best: { section: NavSection; leaf: NavLeaf | null; depth: number } | null = null;
  for (const section of sections) {
    for (const leaf of section.items) {
      if (isPathActive(pathname, leaf.href)) {
        const depth = segments(leaf.href).length;
        if (!best || depth > best.depth) best = { section, leaf, depth };
      }
    }
    if (isPathActive(pathname, section.href)) {
      const depth = segments(section.href).length;
      if (!best || depth > best.depth) best = { section, leaf: null, depth };
    }
  }
  return best ? { section: best.section, leaf: best.leaf } : null;
}

/**
 * O que a rota exige. Página de item: a permissão do item. Página de
 * seção (landing do módulo): qualquer uma das permissões dos itens.
 * Rota não registrada: sem exigência de UI (a API continua decidindo).
 */
export function routeRequirement(sections: NavSection[], pathname: string): NavLeaf["permission"] | undefined {
  const match = matchLeaf(sections, pathname);
  if (!match) return undefined;
  if (match.leaf) return match.leaf.permission;
  const perms = match.section.items.flatMap((item) =>
    item.permission ? (Array.isArray(item.permission) ? item.permission : [item.permission]) : []
  );
  if (match.section.items.some((item) => !item.permission)) return undefined;
  return perms.length > 0 ? perms : undefined;
}

export type Crumb = { label: string; href?: string };

export function breadcrumbFor(sections: NavSection[], pathname: string, rootLabel: string, rootHref: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: rootLabel, href: rootHref }];
  const match = matchLeaf(sections, pathname);
  if (!match) return crumbs;
  if (match.section.href !== rootHref) crumbs.push({ label: match.section.label, href: match.section.href });
  if (match.leaf && match.leaf.href !== match.section.href && match.leaf.href !== rootHref) {
    crumbs.push({ label: match.leaf.label, href: match.leaf.href });
  }
  return crumbs;
}

/** Só aceita destinos internos (evita redirecionamento aberto via ?next=). */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
