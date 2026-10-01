"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Landmark, Menu, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Badge } from "@/components/ui/Badge";
import { ADMIN_ENTRY_PERMISSIONS, ADMIN_ICONS, ADMIN_NAV, ERP_NAV, PLATFORM_ICONS, PLATFORM_NAV, type NavSection } from "@/lib/nav";
import { breadcrumbFor, canAccess, routeRequirement, visibleSections } from "@/lib/navigation/access";
import { statusMeta } from "@/lib/status";
import { SessionProvider, useSession } from "./SessionProvider";
import { Sidebar } from "./Sidebar";
import { BreadcrumbTailProvider, Breadcrumbs, ShellSectionProvider, useBreadcrumbTailValue } from "./Breadcrumbs";
import { CommandMenu } from "./CommandMenu";
import { NotificationsButton, SearchTrigger, SidebarSearch, ThemeToggle, UnitSwitcher, UserMenu } from "./ShellControls";
import { BrandMark, BrandWordmark } from "./Brand";
import { PRODUCT_NAME } from "@/lib/brand";
import { BranchPrompt } from "./BranchPrompt";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { AccessStateCard } from "@/components/auth/AccessStateCard";
import { LogoutButton } from "@/components/auth/LogoutButton";

// Moldura comum dos três ambientes do ATLAS.ERP:
//   erp      — operação da empresa (/app)
//   admin    — Administração da Empresa (/app/admin)
//   platform — Administração Central da plataforma (/app/admincentral)
// São ambientes distintos (sidebar, cabeçalho, trilha e linguagem
// próprios), não uma mesma sidebar com itens a mais.
//
// Composição: a navegação vive no "chrome" (moldura) e a página numa folha
// (background) com cantos arredondados e rolagem própria no desktop; o
// cabeçalho fica fixo no topo da folha, translúcido. No mobile a folha
// ocupa a tela inteira e a navegação vira gaveta.

export type Environment = "erp" | "admin" | "platform";

const COLLAPSE_KEY = "educa-sidebar-collapsed";

const ENV = {
  erp: { nav: ERP_NAV, rootLabel: "Início", rootHref: "/app" },
  admin: { nav: ADMIN_NAV, rootLabel: "Administração da Empresa", rootHref: "/app/admin" },
  platform: { nav: PLATFORM_NAV, rootLabel: "Administração Central", rootHref: "/app/admincentral" },
} as const;

function initialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function FullPageState({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center bg-background p-4">{children}</div>;
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh bg-chrome" aria-busy="true" aria-label="Carregando">
      <div className="hidden w-64 p-3.5 lg:block">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-4 h-8 w-full" />
        <div className="mt-6 flex flex-col gap-2.5">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col lg:h-dvh lg:py-2 lg:pr-2">
        <div className="flex-1 bg-background lg:rounded-xl lg:border lg:border-border">
          <div className="h-14 border-b border-border-subtle" />
          <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-72" />
            <Skeleton className="mt-8 h-28 w-full" />
            <Skeleton className="mt-4 h-72 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function NoAccess({ title = "Sem acesso a este recurso", description, backHref }: { title?: string; description?: ReactNode; backHref?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <EmptyState
        kind="no-permission"
        title={title}
        description={description ?? "Seu perfil não tem a permissão necessária para esta área. Se precisar dela, solicite ao administrador da sua empresa."}
        action={
          backHref ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={backHref}>
                <ArrowLeft size={14} /> Voltar
              </Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

// Último título definido pelo shell (pode ser refinado quando a trilha muda).
let lastShellTitle = "";

function ShellInner({ environment, children }: { environment: Environment; children: ReactNode }) {
  const session = useSession();
  const { status, data, error, reload, can, canAny, canPlatform } = session;
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<boolean>(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const tail = useBreadcrumbTailValue();
  const env = ENV[environment];
  const permissionCheck = environment === "platform" ? canPlatform : can;

  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  // Título da aba a partir da trilha (páginas cliente não exportam metadata).
  const titleLabel = useMemo(() => {
    const trail = [...breadcrumbFor(env.nav, pathname, env.rootLabel, env.rootHref), ...tail];
    return trail[trail.length - 1]?.label ?? env.rootLabel;
  }, [env, pathname, tail]);
  useEffect(() => {
    const suffix = environment === "erp" ? PRODUCT_NAME : environment === "admin" ? `Administração · ${PRODUCT_NAME}` : `Administração Central · ${PRODUCT_NAME}`;
    const desired = titleLabel === env.rootLabel ? `${env.rootLabel} · ${PRODUCT_NAME}` : `${titleLabel} · ${suffix}`;
    // Só substitui títulos genéricos: páginas com metadata própria mantêm o seu.
    const generic = new Set([PRODUCT_NAME, `Administração da Empresa · ${PRODUCT_NAME}`, `Administração Central · ${PRODUCT_NAME}`, ""]);
    const apply = () => {
      if (document.title !== desired && (generic.has(document.title) || document.title === lastShellTitle)) {
        document.title = desired;
        lastShellTitle = desired;
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [titleLabel, environment, env.rootLabel]);

  // Membro só da plataforma que cai no ERP vai para a Administração Central.
  useEffect(() => {
    if (status === "ready" && environment === "erp" && !data?.tenant && data?.platform) router.replace("/app/admincentral");
  }, [status, environment, data, router]);

  const sections: NavSection[] = useMemo(() => visibleSections(env.nav, permissionCheck), [env.nav, permissionCheck]);

  const adminHref = data?.tenant && canAny(ADMIN_ENTRY_PERMISSIONS) ? "/app/admin" : null;
  const platformHref = data?.platform ? "/app/admincentral" : null;
  const erpHref = data?.tenant ? "/app" : null;

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // preferência só desta sessão
      }
      return next;
    });
  }

  if (status === "loading" || status === "unauthenticated") return <ShellSkeleton />;

  if (status === "error") {
    return (
      <FullPageState>
        <div className="w-full max-w-md rounded-lg border border-border bg-surface">
          <EmptyState kind="error" title="Não foi possível carregar sua sessão" description={error} onRetry={reload} action={<LogoutButton />} />
        </div>
      </FullPageState>
    );
  }

  // --------------------------------------------------- acesso ao ambiente
  const tenantMissing = environment !== "platform" && !data?.tenant;
  const adminDenied = environment === "admin" && !!data?.tenant && !canAny(ADMIN_ENTRY_PERMISSIONS);
  const platformDenied = environment === "platform" && !data?.platform;
  // Membro da plataforma sem vínculo de empresa não administra empresas.
  if (environment === "admin" && !data?.tenant && data?.platform) {
    return (
      <FullPageState>
        <div className="w-full max-w-md">
          <NoAccess
            title="Acesso restrito à Administração da Empresa"
            description="A Administração da Empresa é exclusiva dos administradores de cada empresa. Membros da plataforma usam a Administração Central, sem acesso aos dados das empresas."
            backHref="/app/admincentral"
          />
        </div>
      </FullPageState>
    );
  }
  // Autenticado sem contexto de empresa: acesso não configurado, conta
  // desativada ou empresa indisponível — explicado, sem detalhe técnico.
  if (tenantMissing && !(environment === "erp" && data?.platform)) {
    return (
      <AuthFrame>
        <AccessStateCard state={data?.access && data.access !== "active" ? data.access : "no_company"} email={data?.authUser.email} />
      </AuthFrame>
    );
  }
  if (adminDenied || platformDenied) {
    return (
      <FullPageState>
        <div className="w-full max-w-md">
          <NoAccess
            title={platformDenied ? "Acesso restrito à Administração Central" : "Acesso restrito à Administração da Empresa"}
            description={
              platformDenied
                ? `Este ambiente é exclusivo dos membros da plataforma ${PRODUCT_NAME} (Owner e Admin).`
                : "Seu perfil não tem permissões administrativas nesta empresa."
            }
            backHref={erpHref ?? undefined}
          />
        </div>
      </FullPageState>
    );
  }
  if (environment === "erp" && !data?.tenant) return <ShellSkeleton />;

  const requirement = routeRequirement(env.nav, pathname);
  const allowed = canAccess(requirement, permissionCheck);
  const crumbs = [...breadcrumbFor(env.nav, pathname, env.rootLabel, env.rootHref), ...tail];
  // Módulo da página (sobrelinha do PageHeader): no ERP o 2º nível da
  // trilha (Início › Comercial › …); nos ambientes administrativos, o
  // próprio ambiente.
  const section = environment === "erp" ? (crumbs.length >= 3 ? crumbs[1] : null) : crumbs.length >= 2 ? crumbs[0] : null;
  const tenant = data?.tenant;
  const platform = environment === "platform";
  const lifecycle = tenant ? statusMeta("company_lifecycle", tenant.company.lifecycle_status) : null;

  const sidebarHeader =
    environment === "platform" ? (
      <Link href="/app/admincentral" className="flex min-w-0 items-center gap-2.5 text-platform-foreground">
        <BrandMark className="text-platform-foreground" />
        <span className={cn("min-w-0", collapsed && "lg:hidden")}>
          <BrandWordmark context="Administração Central" />
        </span>
      </Link>
    ) : (
      <Link href={environment === "admin" ? "/app/admin" : "/app"} className="flex min-w-0 items-center gap-2.5 text-sidebar-foreground">
        <BrandMark />
        <span className={cn("min-w-0", collapsed && "lg:hidden")}>
          <BrandWordmark context={environment === "admin" ? "Administração da Empresa" : tenant?.company.name} />
        </span>
      </Link>
    );

  const sidebarFooter =
    environment === "erp" ? (
      adminHref || platformHref ? (
        <div className="flex flex-col gap-0.5">
          {adminHref && (
            <Link href={adminHref} className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground", collapsed && "lg:justify-center lg:px-0")} title="Administração da Empresa">
              <Building2 size={16} strokeWidth={1.75} className="shrink-0" />
              <span className={cn("truncate", collapsed && "lg:sr-only")}>Administração da Empresa</span>
            </Link>
          )}
          {platformHref && (
            <Link href={platformHref} className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground", collapsed && "lg:justify-center lg:px-0")} title="Administração Central">
              <Landmark size={16} strokeWidth={1.75} className="shrink-0" />
              <span className={cn("truncate", collapsed && "lg:sr-only")}>Administração Central</span>
            </Link>
          )}
        </div>
      ) : null
    ) : (
      <Link
        href={erpHref ?? "/app"}
        className={cn(
          "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm",
          platform ? "text-platform-muted hover:bg-platform-hover hover:text-platform-foreground" : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
          collapsed && "lg:justify-center lg:px-0",
          !erpHref && "hidden"
        )}
      >
        <ArrowLeft size={16} strokeWidth={1.75} className="shrink-0" />
        <span className={cn("truncate", collapsed && "lg:sr-only")}>Voltar ao ERP</span>
      </Link>
    );

  const environmentLinks = [
    ...(environment !== "erp" && erpHref ? [{ label: "Voltar ao ERP", href: erpHref, kind: "erp" as const }] : []),
    ...(environment !== "admin" && adminHref ? [{ label: "Administração da Empresa", href: adminHref, kind: "admin" as const }] : []),
    ...(environment !== "platform" && platformHref ? [{ label: "Administração Central", href: platformHref, kind: "platform" as const }] : []),
  ];

  return (
    <div className={cn("flex min-h-dvh", platform ? "bg-platform" : "bg-chrome")} data-environment={environment}>
      <Sidebar
        variant={environment}
        sections={sections}
        icons={environment === "admin" ? ADMIN_ICONS : environment === "platform" ? PLATFORM_ICONS : undefined}
        header={sidebarHeader}
        search={<SidebarSearch onOpen={() => setCommandOpen(true)} variant={platform ? "platform" : "default"} />}
        footer={sidebarFooter}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col lg:h-dvh lg:py-2 lg:pr-2">
        <div
          id="folha"
          className={cn(
            "relative flex min-h-0 flex-1 flex-col bg-background lg:overflow-y-auto lg:rounded-xl lg:border lg:shadow-xs",
            platform ? "lg:border-platform-border" : "lg:border-border"
          )}
        >
          {/* Faixa de ambiente: deixa explícito onde o usuário está. */}
          {environment === "platform" && <div aria-hidden className="h-0.5 shrink-0 bg-platform-accent lg:rounded-t-xl" />}
          {environment === "admin" && (
            <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-accent/30 bg-accent-soft px-4 py-1.5 text-xs text-foreground sm:px-6 lg:rounded-t-xl lg:px-8">
              <ShieldCheck size={13} className="shrink-0 text-accent-fg" aria-hidden />
              <span className="truncate">
                <span className="font-semibold">Administração da Empresa</span>
                <span className="text-muted-foreground"> · {tenant?.company.name} · alterações aqui afetam somente esta empresa</span>
              </span>
              <Link href="/app" className="ml-auto shrink-0 font-medium underline-offset-4 hover:underline">
                Voltar ao ERP
              </Link>
            </div>
          )}
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-background/85 px-3 backdrop-blur-md sm:px-5 lg:px-8">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover lg:hidden"
            >
              <Menu size={18} />
            </button>
            <Breadcrumbs items={crumbs} className="flex-1" />
            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              {environment === "platform" && (
                <Badge tone="critical" className="hidden sm:inline-flex">
                  Plataforma {PRODUCT_NAME}
                </Badge>
              )}
              {environment !== "platform" && lifecycle && tenant && tenant.company.lifecycle_status !== "ACTIVE" && (
                <Badge tone={lifecycle.tone} className="hidden sm:inline-flex">
                  {lifecycle.label}
                </Badge>
              )}
              {environment === "erp" && <UnitSwitcher />}
              <div className="lg:hidden">
                <SearchTrigger onOpen={() => setCommandOpen(true)} />
              </div>
              {environment === "erp" && <NotificationsButton />}
              <ThemeToggle />
              <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
              <UserMenu
                adminHref={environment === "admin" ? null : adminHref}
                platformHref={environment === "platform" ? null : platformHref}
                erpHref={environment === "erp" ? null : erpHref}
              />
            </div>
          </header>
          {tenant && !tenant.company.operational && environment === "erp" && (
            <div role="alert" className="border-b border-warning/40 bg-warning-soft px-4 py-2 text-sm text-warning-fg sm:px-6 lg:px-8">
              A empresa está com status &quot;{lifecycle?.label}&quot; na plataforma. As operações ficam indisponíveis até a regularização.
            </div>
          )}
          <main id="conteudo" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <ShellSectionProvider value={section}>
              <div className="mx-auto w-full max-w-screen-2xl animate-rise-in">
                {allowed ? children : <NoAccess backHref={env.rootHref} />}
              </div>
            </ShellSectionProvider>
          </main>
        </div>
      </div>
      {environment === "erp" && <BranchPrompt />}
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} sections={sections} environmentLinks={environmentLinks} />
    </div>
  );
}

export function ShellFrame({ environment, children }: { environment: Environment; children: ReactNode }) {
  return (
    <SessionProvider>
      <BreadcrumbTailProvider>
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[90] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-overlay">
          Pular para o conteúdo
        </a>
        <ShellInner environment={environment}>{children}</ShellInner>
      </BreadcrumbTailProvider>
    </SessionProvider>
  );
}
