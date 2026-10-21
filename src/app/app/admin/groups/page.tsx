"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Copy, KeyRound, LayoutList, Pencil, Plus, RotateCcw, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { Drawer } from "@/components/ui/Drawer";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Checkbox, Select } from "@/components/ui/Controls";
import { Alert, EmptyState, SkeletonRows } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { apiGet, apiSend } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";

// Grupos da turma (Modo Estudo, 0096). Cada grupo é uma empresa isolada; o
// professor cria grupos, cadastra alunos, define o setor de cada um (o setor
// traz as permissões, 0102) e gera/revoga senhas provisórias — inclusive uma
// nova para quem já tem acesso e esqueceu a senha.
// Ele vê só contagens do grupo, nunca os dados. O banco decide tudo.

type Context = { is_study: boolean; can_manage: boolean; parent_name: string | null };
type Group = { id: string; name: string; created_at: string; members: number; logins: number; pending_invitations: number; products: number; sales_orders: number; purchase_orders: number };
type Role = { id: string; code: string; name: string; screens: string[] | null };
type Screen = { href: string; area: string; label: string };
type Member = {
  id: string;
  name: string;
  email: string;
  status: string;
  has_login: boolean;
  roles: string | null;
  invitation_status: string | null;
  invitation_expires_at: string | null;
  sector_code: string | null;
  sector_name: string | null;
  is_admin: boolean;
  level_role_id: string | null;
  profile_role_id: string | null;
};
type Issued = { password: string; email: string; expiresAt: string };

function memberState(m: Member): { label: string; tone: "success" | "warning" | "neutral" | "danger" } {
  if (m.status !== "active") return { label: "Inativo", tone: "neutral" };
  if (m.has_login) return { label: "Com acesso", tone: "success" };
  if (m.invitation_status === "pending") return { label: "Senha provisória pendente", tone: "warning" };
  if (m.invitation_status === "expired") return { label: "Senha provisória vencida", tone: "danger" };
  return { label: "Sem acesso", tone: "neutral" };
}

/** Perfil com telas (0105): nome + telas marcadas, agrupadas por área do menu. */
function ProfileDialog({ groupId, profile, screens, onClose, onSaved }: { groupId: string; profile: Role | null; screens: Screen[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(profile?.name ?? "");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(profile?.screens ?? []));
  const [busy, setBusy] = useState(false);
  const areas = [...new Set(screens.map((x) => x.area))];

  const toggle = (href: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(href);
      else next.delete(href);
      return next;
    });

  async function save() {
    if (!name.trim()) return toast.error("Informe o nome do perfil.");
    if (picked.size === 0) return toast.error("Marque ao menos uma tela.");
    setBusy(true);
    try {
      await apiSend(`/api/admin/study/groups/${groupId}/profiles`, "POST", { ...(profile ? { roleId: profile.id } : {}), name: name.trim(), screens: [...picked] });
      toast.success(profile ? "Perfil atualizado." : "Perfil criado.", "Escolha o perfil no campo Papel de cada aluno.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o perfil.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title={profile ? `Editar perfil ${profile.name}` : "Novo perfil com telas"}
      description="Quem tiver este perfil vê no menu só as telas marcadas e recebe as permissões para trabalhar nelas."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={save} loading={busy}>
            Salvar perfil
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nome do perfil" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex.: Comercial e Financeiro" />
        </FormField>
        {areas.map((area) => {
          const list = screens.filter((x) => x.area === area);
          const all = list.every((x) => picked.has(x.href));
          return (
            <fieldset key={area} className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
              <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
                <Checkbox id={`area-${area}`} checked={all} onCheckedChange={(v) => list.forEach((x) => toggle(x.href, v === true))} aria-label={`Todas as telas de ${area}`} />
                <label htmlFor={`area-${area}`}>{area}</label>
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {list.map((x) => (
                  <label key={x.href} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={picked.has(x.href)} onCheckedChange={(v) => toggle(x.href, v === true)} />
                    {x.label}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
        <p className="text-xs text-muted-foreground">{picked.size} tela(s) marcada(s). Início e Aparência aparecem sempre.</p>
      </div>
    </Dialog>
  );
}

function GroupDrawer({ group, onClose, onChanged }: { group: Group | null; onClose: () => void; onChanged: () => void }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", roleId: "", sector: "" });
  const [screens, setScreens] = useState<Screen[]>([]);
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [issued, setIssued] = useState<(Issued & { name: string }) | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "issue" | "revoke" | "reset"; member: Member } | null>(null);

  const load = useCallback(async () => {
    if (!group) return;
    try {
      const [data, screenList] = await Promise.all([
        apiGet<{ roles: Role[]; members: Member[] }>(`/api/admin/study/groups/${group.id}`),
        apiGet<Screen[]>("/api/admin/screens").catch(() => [] as Screen[]),
      ]);
      setScreens(screenList);
      setRoles(data.roles);
      setMembers(data.members);
      setError(null);
      setForm((f) => (f.roleId ? f : { ...f, roleId: data.roles.find((r) => r.code === "gerente")?.id ?? data.roles[0]?.id ?? "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar o grupo.");
    }
  }, [group]);

  useEffect(() => {
    // Carrega o grupo ao abrir (o componente é remontado por grupo: key).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function addMember() {
    if (!group) return;
    if (!form.name.trim() || !form.email.trim() || !form.roleId) return toast.error("Informe nome, e-mail e papel do aluno.");
    setBusy("add");
    try {
      const created = await apiSend<{ user_id: string }>(`/api/admin/study/groups/${group.id}/members`, "POST", { name: form.name.trim(), email: form.email.trim(), roleId: form.roleId });
      if (form.sector && created?.user_id) await apiSend(`/api/admin/study/members/${created.user_id}/role`, "POST", { roleId: form.sector });
      toast.success("Aluno cadastrado.", "Agora gere a senha provisória dele.");
      setForm((f) => ({ ...f, name: "", email: "", sector: "" }));
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cadastrar o aluno.");
    } finally {
      setBusy(null);
    }
  }

  // Papel = nível (perfis sem telas); Setor = perfil com telas do professor (0107).
  const levelRoles = roles.filter((r) => !r.screens && !r.code.startsWith("setor_"));
  const profiles = roles.filter((r) => r.screens);

  async function changeRole(member: Member, roleId: string) {
    if (!roleId || roleId === member.level_role_id) return;
    setBusy(`role-${member.id}`);
    try {
      await apiSend(`/api/admin/study/members/${member.id}/role`, "POST", { roleId });
      toast.success(`${member.name}: papel atualizado.`, "O setor continua o mesmo.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível mudar o papel.");
    } finally {
      setBusy(null);
    }
  }

  async function changeProfile(member: Member, value: string) {
    if (!value || value === (member.profile_role_id ?? "none")) return;
    setBusy(`profile-${member.id}`);
    try {
      if (value === "none") await apiSend(`/api/admin/study/members/${member.id}/profile`, "DELETE");
      else await apiSend(`/api/admin/study/members/${member.id}/role`, "POST", { roleId: value });
      toast.success(`${member.name}: setor atualizado.`, value === "none" ? "O menu volta a seguir o papel." : "O menu mostra só as telas do setor.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível mudar o setor.");
    } finally {
      setBusy(null);
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    const { kind, member } = confirm;
    setBusy(kind);
    try {
      if (kind === "issue" || kind === "reset") {
        const path = kind === "issue" ? "temporary-password" : "password-reset";
        const res = await apiSend<Issued>(`/api/admin/study/members/${member.id}/${path}`, "POST", {});
        setIssued({ ...res, name: member.name });
        toast.success("Senha provisória gerada.");
      } else {
        const res = await apiSend<{ revoked: boolean }>(`/api/admin/study/members/${member.id}/temporary-password`, "DELETE");
        if (issued?.email === member.email) setIssued(null);
        toast.success(res.revoked ? "Senha provisória revogada." : "Não havia senha provisória pendente.");
      }
      setConfirm(null);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Senha copiada.");
    } catch {
      toast.error("Não foi possível copiar. Selecione a senha e copie manualmente.");
    }
  }

  return (
    <Drawer open={group !== null} onClose={onClose} size="lg" title={group?.name ?? ""} subtitle="Alunos do grupo e acesso">
      <div className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}

        {issued && (
          <Alert tone="warning" title="Senha provisória — anote agora">
            <p>
              Entregue esta senha a {issued.name} por um canal seguro. Ela vale até {formatDateTime(issued.expiresAt)} para o login {issued.email}{" "}
              e <strong>não será mostrada de novo</strong>. No próximo acesso o aluno cria a própria senha.
            </p>
            <div className="mt-2 flex gap-2">
              <Input readOnly value={issued.password} aria-label="Senha provisória" className="code text-sm tracking-wide" onFocus={(e) => e.currentTarget.select()} />
              <Button size="sm" variant="secondary" onClick={() => copy(issued.password)}>
                <Copy size={14} aria-hidden /> Copiar
              </Button>
            </div>
          </Alert>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Alunos</h3>
          {members === null ? (
            <SkeletonRows columns={3} />
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum aluno ainda. Cadastre abaixo.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
              {members.map((m) => {
                const state = memberState(m);
                const canIssue = m.status === "active" && !m.has_login;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.email}
                        {m.sector_name ? ` · ${m.sector_name}` : ""}
                        {m.roles ? ` · ${m.roles}` : ""}
                        {m.invitation_status === "pending" && m.invitation_expires_at ? ` · vale até ${formatDateTime(m.invitation_expires_at)}` : ""}
                      </p>
                    </div>
                    <Badge tone={state.tone}>{state.label}</Badge>
                    {levelRoles.length > 0 && (
                      <div className="w-full sm:w-48">
                        <span className="mb-1 block text-xs text-muted-foreground">Papel (nível)</span>
                        <Select
                          value={m.level_role_id ?? ""}
                          onValueChange={(v) => changeRole(m, v)}
                          options={levelRoles.map((r) => ({ value: r.id, label: r.name }))}
                          placeholder="Escolher papel"
                          disabled={busy !== null}
                          aria-label={`Papel de ${m.name}`}
                        />
                      </div>
                    )}
                    <div className="w-full sm:w-52">
                      <span className="mb-1 block text-xs text-muted-foreground">Setor (telas que cuida)</span>
                      <Select
                        value={m.profile_role_id ?? "none"}
                        onValueChange={(v) => changeProfile(m, v)}
                        options={[{ value: "none", label: "Todas as telas do papel" }, ...profiles.map((r) => ({ value: r.id, label: r.name }))]}
                        disabled={busy !== null}
                        aria-label={`Setor de ${m.name}`}
                      />
                    </div>
                    {m.status === "active" && m.has_login && (
                      <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setConfirm({ kind: "reset", member: m })}>
                        <RotateCcw size={14} aria-hidden /> Nova senha provisória
                      </Button>
                    )}
                    {canIssue && (
                      <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setConfirm({ kind: "issue", member: m })}>
                        <KeyRound size={14} aria-hidden /> {m.invitation_status === "pending" ? "Gerar outra" : "Gerar senha provisória"}
                      </Button>
                    )}
                    {canIssue && m.invitation_status === "pending" && (
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setConfirm({ kind: "revoke", member: m })}>
                        <Ban size={14} aria-hidden /> Revogar
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {screens.length > 0 && (
          <section className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Perfis com telas</h3>
                <p className="text-xs text-muted-foreground">Monte perfis escolhendo as telas; depois escolha o perfil no campo Papel de cada aluno.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setEditing("new")} disabled={busy !== null}>
                <LayoutList size={14} aria-hidden /> Novo perfil
              </Button>
            </div>
            {roles.filter((r) => r.screens).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum perfil com telas ainda.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border-subtle">
                {roles
                  .filter((r) => r.screens)
                  .map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {(r.screens ?? []).map((h) => screens.find((x) => x.href === h)?.label ?? h).join(", ")}
                        </span>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)} disabled={busy !== null}>
                        <Pencil size={14} aria-hidden /> Editar
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-lg border border-border-subtle p-3">
          <h3 className="text-sm font-semibold">Cadastrar aluno</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Nome" required>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={160} />
            </FormField>
            <FormField label="E-mail" required>
              <Input type="email" inputMode="email" autoComplete="off" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} maxLength={254} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Setor (telas que cuida)" help="Seus perfis com telas. Em branco: todas as telas do papel.">
              <Select value={form.sector} onValueChange={(v) => setForm((f) => ({ ...f, sector: v }))} options={profiles.map((r) => ({ value: r.id, label: r.name }))} placeholder="Escolha o setor" />
            </FormField>
            <FormField label="Papel (nível)" required help="Gerente faz quase tudo; Operador cria e edita; Somente leitura só consulta.">
              <Select value={form.roleId} onValueChange={(v) => setForm((f) => ({ ...f, roleId: v }))} options={levelRoles.map((r) => ({ value: r.id, label: r.name }))} placeholder="Escolha o papel" />
            </FormField>
          </div>
          <div>
            <Button size="sm" onClick={addMember} loading={busy === "add"} disabled={busy !== null}>
              <UserPlus size={14} aria-hidden /> Cadastrar aluno
            </Button>
          </div>
        </section>
      </div>

      {editing && group && (
        <ProfileDialog
          key={editing === "new" ? "new" : editing.id}
          groupId={group.id}
          profile={editing === "new" ? null : editing}
          screens={screens}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          open
          title={
            confirm.kind === "issue"
              ? `Gerar senha provisória para ${confirm.member.name}?`
              : confirm.kind === "reset"
                ? `Nova senha provisória para ${confirm.member.name}?`
                : "Revogar a senha provisória?"
          }
          description={
            confirm.kind === "issue"
              ? "A senha aparece uma única vez para você entregar. No primeiro login o aluno cria a própria senha. Uma senha provisória anterior deixa de valer."
              : confirm.kind === "reset"
                ? "Para quem esqueceu a senha: a senha atual do aluno deixa de valer agora. A provisória aparece uma única vez e, no próximo acesso, ele cria uma senha nova."
                : "A senha provisória deixa de funcionar imediatamente. Você pode gerar outra quando quiser."
          }
          confirmLabel={confirm.kind === "revoke" ? "Revogar" : "Gerar senha"}
          tone="danger"
          loading={busy === confirm.kind}
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </Drawer>
  );
}

export default function AdminGroupsPage() {
  const [data, setData] = useState<{ context: Context; groups: Group[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Group | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiGet<{ context: Context; groups: Group[] }>("/api/admin/study"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar os grupos.");
    }
  }, []);

  useEffect(() => {
    // Carrega ao abrir a tela.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function createGroup() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiSend("/api/admin/study/groups", "POST", { name: name.trim() });
      toast.success("Grupo criado.", "Abra o grupo para cadastrar os alunos.");
      setName("");
      setCreating(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o grupo.");
    } finally {
      setBusy(false);
    }
  }

  const ctx = data?.context;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Grupos da turma"
        description="Cada grupo funciona como uma empresa separada: os alunos de um grupo não veem os dados dos outros."
        actions={
          ctx?.can_manage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus size={15} /> Novo grupo
            </Button>
          ) : undefined
        }
      />

      {error && <EmptyState kind="error" title="Não foi possível carregar os grupos" description={error} onRetry={load} framed />}

      {!error && !data && <SkeletonRows columns={4} />}

      {data && !ctx?.is_study && (
        <EmptyState
          title="Disponível só em turmas"
          description={
            ctx?.parent_name
              ? `Esta empresa é um grupo da turma ${ctx.parent_name}. Os grupos são criados pelo professor, na turma.`
              : "Grupos existem em empresas do tipo Estudo. Peça ao administrador da plataforma para cadastrar a turma como Estudo."
          }
          framed
        />
      )}

      {data && ctx?.is_study && !ctx.can_manage && (
        <EmptyState title="Só o administrador da turma gerencia os grupos" description="Peça ao professor responsável." framed />
      )}

      {data && ctx?.can_manage && (
        <Panel className="overflow-hidden">
          <PanelHeader title={`${data.groups.length} ${data.groups.length === 1 ? "grupo" : "grupos"}`} description="Contagens de cada grupo. O conteúdo é só dos alunos." icon={<Users size={15} />} />
          {data.groups.length === 0 ? (
            <EmptyState
              title="Nenhum grupo ainda"
              description="Crie um grupo para cada equipe de alunos."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus size={14} /> Novo grupo
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.groups.map((g) => (
                <li key={g.id}>
                  <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-surface-hover" onClick={() => setOpen(g)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{g.name}</span>
                      <span className="block text-xs text-muted-foreground">Criado em {formatDate(g.created_at)}</span>
                    </span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                      <span>
                        {g.members} {g.members === 1 ? "aluno" : "alunos"} ({g.logins} com acesso)
                      </span>
                      <span>{g.products} produtos</span>
                      <span>{g.sales_orders} pedidos de venda</span>
                      <span>{g.purchase_orders} pedidos de compra</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Dialog
        open={creating}
        onOpenChange={(next) => !busy && setCreating(next)}
        title="Novo grupo"
        description="O grupo nasce vazio, com o mesmo plano e os mesmos módulos da turma."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={createGroup} loading={busy} disabled={!name.trim()}>
              Criar grupo
            </Button>
          </>
        }
      >
        <FormField label="Nome do grupo" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} placeholder="Ex.: Grupo 1 — Logística" />
        </FormField>
      </Dialog>

      <GroupDrawer key={open?.id ?? "none"} group={open} onClose={() => setOpen(null)} onChanged={load} />
    </div>
  );
}
