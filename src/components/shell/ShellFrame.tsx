"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Landmark, LogOut, Menu, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Badge } from "@/components/ui/Badge";
import { ADMIN_ENTRY_PERMISSIONS, ADMIN_ICONS, ADMIN_NAV, ERP_NAV, PLATFORM_ICONS, PLATFORM_NAV, type NavSection } from "@/lib/nav";
import { breadcrumbFor, canAccess, routeRequirement, visibleSections } from "@/lib/navigation/access";
import { statusMeta } from "@/lib/status";
import { SessionProvider, useSession } from "./SessionProvider";
import { Sidebar } from "./Sidebar";
import { BreadcrumbTailProvider, Breadcrumbs, useBreadcrumbTailValue } from "./Breadcrumbs";
import { CommandMenu } from "./CommandMenu";
import { NotificationsButton, SearchTrigger, ThemeToggle, UnitSwitcher, UserMenu } from "./ShellControls";
import { EducaMark, EducaWordmark } from "./Brand";

// Moldura comum dos três ambientes do EDUCA:
//   erp      — operação da empresa (/)
//   admin    — Administração da Empresa (/admin)
//   platform — Administração Central da plataforma (/admincentral)
// São ambientes distintos (sidebar, cabeçalho, trilha e linguagem
// próprios), não uma mesma sidebar com itens a mais.

export type Environment = "erp" | "admin" | "platform";

const COLLAPSE_KEY = "educa-sidebar-collapsed";

const ENV = {
  erp: { nav: ERP_NAV, rootLabel: "Início", rootHref: "/" },
  admin: { nav: ADMIN_NAV, rootLabel: "Administração da Empresa", rootHref: "/admin" },
  platform: { nav: PLATFORM_NAV, rootLabel: "Administração Central", rootHref: "/admincentral" },
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
    <div className="flex min-h-dvh bg-background" aria-busy="true" aria-label="Carregando">
      <div className="hidden w-60 border-r border-sidebar-border bg-sidebar p-3 lg:block">
        <Skeleton className="h-6 w-32" />
        <div className="mt-6 flex flex-col gap-2">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1">
        <div className="h-14 border-b border-border bg-surface" />
        <div className="mx-auto max-w-screen-2xl p-6">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="mt-6 h-24 w-full" />
          <Skeleton className="mt-4 h-64 w-full" />
        </div>
      </div>
    </div>
  );
}

function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <Button type="submit" variant="ghost" size="sm">
        <LogOut size={14} /> Sair
      </Button>
    </form>
  );
}

export function NoAccess({ title = "Sem acesso a este recurso", description, backHref }: { title?: string; description?: ReactNode; backHref?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface">
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

  // Membro só da plataforma que cai no ERP vai para a Administração Central.
  useEffect(() => {
    if (status === "ready" && environment === "erp" && !data?.tenant && data?.platform) router.replace("/admincentral");
  }, [status, environment, data, router]);

  const sections: NavSection[] = useMemo(() => visibleSections(env.nav, permissionCheck), [env.nav, permissionCheck]);

  const adminHref = data?.tenant && canAny(ADMIN_ENTRY_PERMISSIONS) ? "/admin" : null;
  const platformHref = data?.platform ? "/admincentral" : null;
  const erpHref = data?.tenant ? "/" : null;

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
        <div className="w-full max-w-md rounded-md border border-border bg-surface">
          <EmptyState kind="error" title="Não foi possível carregar sua sessão" description={error} onRetry={reload} action={<LogoutButton />} />
        </div>
      </FullPageState>
    );
  }

  // --------------------------------------------------- acesso ao ambiente
  const tenantMissing = environment !== "platform" && !data?.tenant;
  const adminDenied = environment === "admin" && !!data?.tenant && !canAny(ADMIN_ENTRY_PERMISSIONS);
  const platformDenied = environment === "platform" && !data?.platform;
  if (tenantMissing && !(environment === "erp" && data?.platform)) {
    return (
      <FullPageState>
        <div className="w-full max-w-md rounded-md border border-border bg-surface">
          <EmptyState
            kind="no-permission"
            title="Usuário sem empresa vinculada"
            description="Seu acesso está autenticado, mas não há vínculo ativo com uma empresa. Procure o administrador da sua empresa."
            action={<LogoutButton />}
          />
        </div>
      </FullPageState>
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
                ? "Este ambiente é exclusivo dos membros da plataforma EDUCA (Owner e Admin)."
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
  const tenant = data?.tenant;
  const platform = environment === "platform";
  const lifecycle = tenant ? statusMeta("company_lifecycle", tenant.company.lifecycle_status) : null;

  const sidebarHeader =
    environment === "platform" ? (
      <Link href="/admincentral" className="flex min-w-0 items-center gap-2.5 text-platform-foreground" style={{ ["--mark-bar" as string]: "var(--color-platform)" }}>
        <EducaMark className="text-platform-foreground" />
        <span className={cn("min-w-0", collapsed && "lg:hidden")}>
          <EducaWordmark context="Administração Central" />
        </span>
      </Link>
    ) : (
      <Link href={environment === "admin" ? "/admin" : "/"} className="flex min-w-0 items-center gap-2.5 text-sidebar-foreground">
        <EducaMark />
        <span className={cn("min-w-0", collapsed && "lg:hidden")}>
          <EducaWordmark context={environment === "admin" ? "Administração da Empresa" : tenant?.company.name} />
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
        href={erpHref ?? "/"}
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
    <div className={cn("flex min-h-dvh", platform ? "bg-background" : "bg-background")} data-environment={environment}>
      <Sidebar
        variant={environment}
        sections={sections}
        icons={environment === "admin" ? ADMIN_ICONS : environment === "platform" ? PLATFORM_ICONS : undefined}
        header={sidebarHeader}
        footer={sidebarFooter}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Faixa de ambiente: deixa explícito onde o usuário está. */}
        {environment === "admin" && (
          <div className="flex h-8 items-center gap-2 border-b border-accent/40 bg-accent-soft px-4 text-xs text-foreground sm:px-6">
            <ShieldCheck size={13} className="shrink-0 text-warning-fg" aria-hidden />
            <span className="truncate">
              <span className="font-medium">Administração da Empresa</span>
              <span className="text-muted-foreground"> · {tenant?.company.name} · alterações aqui afetam somente esta empresa</span>
            </span>
            <Link href="/" className="ml-auto shrink-0 font-medium underline-offset-4 hover:underline">
              Voltar ao ERP
            </Link>
          </div>
        )}
        {environment === "platform" && <div aria-hidden className="h-0.5 bg-platform-accent" />}
        <header
          className={cn(
            "sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 sm:px-5",
            platform ? "border-platform-border bg-platform text-platform-foreground" : "border-border bg-surface"
          )}
        >
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setMobileOpen(true)}
            className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md lg:hidden", platform ? "text-platform-muted hover:bg-platform-hover" : "text-muted-foreground hover:bg-surface-hover")}
          >
            <Menu size={18} />
          </button>
          <Breadcrumbs items={crumbs} tone={platform ? "platform" : "default"} className="flex-1" />
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            {environment === "platform" && (
              <Badge tone="critical" className="hidden border-platform-accent bg-transparent text-platform-accent-fg sm:inline-flex">
                Plataforma EDUCA
              </Badge>
            )}
            {environment !== "platform" && lifecycle && tenant && tenant.company.lifecycle_status !== "ACTIVE" && (
              <Badge tone={lifecycle.tone} className="hidden sm:inline-flex">
                {lifecycle.label}
              </Badge>
            )}
            {environment === "erp" && <UnitSwitcher />}
            <SearchTrigger onOpen={() => setCommandOpen(true)} variant={platform ? "platform" : "default"} />
            {environment === "erp" && <NotificationsButton />}
            <ThemeToggle variant={platform ? "platform" : "default"} />
            <UserMenu
              variant={platform ? "platform" : "default"}
              adminHref={environment === "admin" ? null : adminHref}
              platformHref={environment === "platform" ? null : platformHref}
              erpHref={environment === "erp" ? null : erpHref}
            />
          </div>
        </header>
        {tenant && !tenant.company.operational && environment === "erp" && (
          <div role="alert" className="border-b border-warning/40 bg-warning-soft px-4 py-2 text-sm text-warning-fg sm:px-6">
            A empresa está com status &quot;{lifecycle?.label}&quot; na plataforma. As operações ficam indisponíveis até a regularização.
          </div>
        )}
        <main id="conteudo" className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-screen-2xl">{allowed ? children : <NoAccess backHref={env.rootHref} />}</div>
        </main>
      </div>
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} sections={sections} environmentLinks={environmentLinks} />
    </div>
  );
}

export function ShellFrame({ environment, children }: { environment: Environment; children: ReactNode }) {
  return (
    <SessionProvider>
      <BreadcrumbTailProvider>
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[90] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-popover">
          Pular para o conteúdo
        </a>
        <ShellInner environment={environment}>{children}</ShellInner>
      </BreadcrumbTailProvider>
    </SessionProvider>
  );
}
