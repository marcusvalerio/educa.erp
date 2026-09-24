"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Building2, Check, ChevronsUpDown, Landmark, LayoutGrid, LogOut, MapPin, Monitor, Moon, Search, Settings2, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar, Segmented } from "@/components/ui/Controls";
import { Kbd } from "@/components/ui/Feedback";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/Menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { useTheme } from "@/components/theme/ThemeProvider";
import { initials } from "@/lib/navigation/access";
import { apiGet } from "@/lib/api-client";
import { useSession } from "./SessionProvider";
import { LogoutForm } from "@/components/auth/LogoutButton";

type Variant = "default" | "platform";

const iconButton = (variant: Variant) =>
  cn(
    "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-ring",
    variant === "platform"
      ? "text-platform-muted hover:bg-platform-hover hover:text-platform-foreground"
      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
  );

// ------------------------------------------------------------ busca
export function SearchTrigger({ onOpen, variant = "default" }: { onOpen: () => void; variant?: Variant }) {
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "hidden h-8 w-full max-w-xs items-center gap-2 rounded-md border px-2.5 text-left text-sm transition-colors md:flex",
          variant === "platform"
            ? "border-platform-border bg-platform-hover text-platform-muted hover:text-platform-foreground"
            : "border-border bg-surface-muted text-subtle-foreground hover:border-border-strong hover:text-muted-foreground"
        )}
      >
        <Search size={14} aria-hidden />
        <span className="flex-1 truncate">Ir para...</span>
        <Kbd className={variant === "platform" ? "border-platform-border bg-platform text-platform-muted" : ""}>Ctrl K</Kbd>
      </button>
      <button type="button" onClick={onOpen} aria-label="Buscar" className={cn(iconButton(variant), "md:hidden")}>
        <Search size={17} />
      </button>
    </>
  );
}

// ------------------------------------------------------------ tema
export function ThemeToggle({ variant = "default" }: { variant?: Variant }) {
  const { preference, resolved, setPreference } = useTheme();
  const Icon = preference === "system" ? Monitor : resolved === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <Tooltip content="Tema">
        <DropdownMenuTrigger aria-label="Alterar tema" className={iconButton(variant)}>
          <Icon size={16} />
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent className="w-44">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        {(
          [
            ["light", "Claro", Sun],
            ["dark", "Escuro", Moon],
            ["system", "Sistema", Monitor],
          ] as const
        ).map(([value, label, ItemIcon]) => (
          <DropdownMenuItem key={value} onSelect={() => setPreference(value)}>
            <ItemIcon size={14} />
            {label}
            {preference === value && <Check size={14} className="ml-auto !text-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ------------------------------------------------------------ unidade
// Só lista as unidades que o banco devolveu como acessíveis. Com uma única
// unidade, é apenas contexto (sem seletor).
export function UnitSwitcher() {
  const { data, branchId, setBranchId } = useSession();
  const branches = data?.tenant?.branches ?? [];
  if (!data?.tenant) return null;
  const current = branches.find((b) => b.id === branchId);
  const label = current ? current.name : branches.length === 0 ? "Sem unidade vinculada" : "Todas as unidades";

  if (branches.length <= 1) {
    return (
      <span className="hidden items-center gap-1.5 truncate text-sm text-muted-foreground lg:flex" title="Unidade">
        <MapPin size={14} className="shrink-0 text-subtle-foreground" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hidden h-8 max-w-56 items-center gap-1.5 rounded-md px-2 text-sm text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring lg:flex"
        aria-label={`Unidade em foco: ${label}`}
      >
        <MapPin size={14} className="shrink-0 text-subtle-foreground" aria-hidden />
        <span className="truncate">{label}</span>
        <ChevronsUpDown size={13} className="shrink-0 text-subtle-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Unidades acessíveis</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setBranchId(null)}>
          Todas as unidades
          {branchId === null && <Check size={14} className="ml-auto !text-foreground" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {branches.map((branch) => (
          <DropdownMenuItem key={branch.id} onSelect={() => setBranchId(branch.id)}>
            <span className="w-12 shrink-0 font-mono text-2xs text-subtle-foreground">{branch.code}</span>
            <span className="truncate">{branch.name}</span>
            {branchId === branch.id && <Check size={14} className="ml-auto !text-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ------------------------------------------------------------ notificações
// Única fonte real de pendências pessoais hoje: aprovações de workflow
// atribuídas ao usuário (fn_workflow_pending_approvals). Sem permissão
// workflow.view, o sino nem aparece — nenhum indicador fictício.
type PendingApproval = {
  approval_id: string;
  workflow_name: string;
  step_name: string;
  entity_type: string;
  due_at: string | null;
  started_at: string;
};

export function NotificationsButton() {
  const { can } = useSession();
  const allowed = can("workflow.view");
  const [items, setItems] = useState<PendingApproval[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    apiGet<PendingApproval[]>("/api/approvals/pending")
      .then((data) => !cancelled && setItems(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  if (!allowed) return null;
  const count = items?.length ?? 0;

  return (
    <Popover>
      <PopoverTrigger aria-label={count > 0 ? `Pendências: ${count}` : "Pendências"} className={cn(iconButton("default"), "relative")}>
        <Bell size={16} />
        {count > 0 && (
          <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-semibold text-warning-contrast tabular-nums">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-sm font-medium">Aprovações pendentes</p>
          <p className="text-xs text-subtle-foreground">Etapas de workflow aguardando sua decisão.</p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {failed ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Não foi possível carregar as pendências.</p>
          ) : items === null ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma aprovação aguardando você.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const overdue = item.due_at ? new Date(item.due_at).getTime() < now : false;
                return (
                  <li key={item.approval_id} className="px-3 py-2.5">
                    <p className="text-sm text-foreground">{item.step_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.workflow_name} · {item.entity_type}
                    </p>
                    {item.due_at && (
                      <p className={cn("mt-0.5 text-2xs tabular-nums", overdue ? "text-danger-fg" : "text-subtle-foreground")}>
                        {overdue ? "Prazo vencido em " : "Prazo: "}
                        {new Date(item.due_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ------------------------------------------------------------ perfil
type UserMenuProps = {
  variant?: Variant;
  adminHref?: string | null;
  platformHref?: string | null;
  erpHref?: string | null;
};

export function UserMenu({ variant = "default", adminHref, platformHref, erpHref }: UserMenuProps) {
  const { data } = useSession();
  const { preference, setPreference } = useTheme();
  const tenant = data?.tenant;
  const name = tenant?.user.name ?? data?.platform?.name ?? data?.authUser.email ?? "Usuário";
  const email = tenant?.user.email ?? data?.platform?.email ?? data?.authUser.email ?? "";
  const subtitle =
    variant === "platform"
      ? `Platform ${data?.platform?.role === "OWNER" ? "Owner" : "Admin"}`
      : [tenant?.position?.name, tenant?.department?.name].filter(Boolean).join(" · ") || tenant?.roles[0]?.name || tenant?.company.name || "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-9 items-center gap-2 rounded-md py-0.5 pr-1.5 pl-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-ring",
          variant === "platform" ? "hover:bg-platform-hover" : "hover:bg-surface-hover"
        )}
        aria-label={`Conta: ${name}`}
      >
        <Avatar name={name} initials={initials(name)} tone={variant === "platform" ? "platform" : "default"} className="h-7 w-7" />
        <span className="hidden min-w-0 text-left leading-tight xl:block">
          <span className={cn("block max-w-40 truncate text-sm font-medium", variant === "platform" ? "text-platform-foreground" : "text-foreground")}>{name}</span>
          {subtitle && (
            <span className={cn("block max-w-40 truncate text-2xs", variant === "platform" ? "text-platform-muted" : "text-subtle-foreground")}>{subtitle}</span>
          )}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar name={name} initials={initials(name)} tone={variant === "platform" ? "platform" : "default"} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-subtle-foreground">{email}</p>
          </div>
        </div>
        {tenant && (
          <div className="mx-2 mb-1 rounded-sm border border-border bg-surface-muted px-2 py-1.5 text-xs">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Building2 size={12} className="text-subtle-foreground" /> {tenant.company.name}
            </p>
            {(tenant.department || tenant.position) && (
              <p className="mt-0.5 text-subtle-foreground">{[tenant.department?.name, tenant.position?.name].filter(Boolean).join(" · ")}</p>
            )}
            {tenant.roles.length > 0 && <p className="mt-0.5 text-subtle-foreground">Papéis: {tenant.roles.map((r) => r.name).join(", ")}</p>}
          </div>
        )}
        <DropdownMenuSeparator />
        {erpHref && (
          <DropdownMenuItem asChild>
            <Link href={erpHref}>
              <LayoutGrid size={14} /> Voltar ao ERP
            </Link>
          </DropdownMenuItem>
        )}
        {adminHref && (
          <DropdownMenuItem asChild>
            <Link href={adminHref}>
              <Building2 size={14} /> Administração da Empresa
            </Link>
          </DropdownMenuItem>
        )}
        {platformHref && (
          <DropdownMenuItem asChild>
            <Link href={platformHref}>
              <Landmark size={14} /> Administração Central
            </Link>
          </DropdownMenuItem>
        )}
        {tenant && (
          <DropdownMenuItem asChild>
            <Link href="/configuracoes/aparencia">
              <Settings2 size={14} /> Preferências
            </Link>
          </DropdownMenuItem>
        )}
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Tema</span>
          <Segmented
            label="Tema"
            size="xs"
            value={preference}
            onChange={setPreference}
            options={[
              { value: "light", label: "Claro" },
              { value: "dark", label: "Escuro" },
              { value: "system", label: "Sistema" },
            ]}
          />
        </div>
        <DropdownMenuSeparator />
        <LogoutForm>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut size={14} /> Sair
            </button>
          </DropdownMenuItem>
        </LogoutForm>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
