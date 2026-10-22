"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Timeline } from "@/components/ui/Timeline";
import { Alert, EmptyState, SkeletonRows } from "@/components/ui/Feedback";
import { invalidateCache, useCached } from "@/lib/dashboard/client";

// Movimentos dos grupos (0111): o professor acompanha, da turma, o que cada
// grupo cadastra, altera, aprova, exclui e movimenta no estoque — com o
// antes e o depois de cada alteração.

type Change = { campo: string; antes: string | null; depois: string | null };
type Item = { id: string; at: string; groupId: string; groupName: string; actor: string | null; entity: string; action: string; stock: boolean; changes: Change[] };
type Group = { id: string; name: string };

const ACTIONS: Record<string, string> = {
  CREATE: "criou",
  UPDATE: "alterou",
  DELETE: "excluiu",
  ACTIVATE: "ativou",
  INACTIVATE: "inativou",
  APPROVE: "aprovou",
  CANCEL: "cancelou",
  CONFIRM: "confirmou",
  RESERVE: "reservou",
  RELEASE: "liberou",
  AUTHORIZE: "autorizou",
  GRANT: "concedeu",
  ASSIGN: "atribuiu",
  UNASSIGN: "removeu",
};

const TONE: Record<string, "success" | "info" | "danger" | "neutral" | "warning"> = { CREATE: "success", UPDATE: "info", DELETE: "danger", CANCEL: "danger", APPROVE: "success" };

export default function MovimentosPage() {
  const [groupId, setGroupId] = useState("");
  const groups = useCached<{ groups: Group[] }>("/api/admin/study");
  const path = `/api/admin/study/activity${groupId ? `?groupId=${groupId}` : ""}`;
  const feed = useCached<Item[]>(path);
  const items = feed.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Movimentos dos grupos"
        description="Tudo o que os alunos fizeram nos ERPs dos grupos: quem fez, quando e o que mudou. Os mais recentes primeiro."
        actions={
          <Button size="sm" variant="secondary" onClick={() => { invalidateCache("/api/admin/study/activity"); window.location.reload(); }}>
            <RefreshCw size={14} aria-hidden /> Atualizar
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="grupo" className="text-sm font-medium">Grupo</label>
        <select id="grupo" value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-9 min-w-0 max-w-full rounded-md border border-border-subtle bg-background px-2 text-sm">
          <option value="">Todos os grupos</option>
          {(groups.data?.groups ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>
      <Panel className="p-4">
        {feed.error ? (
          <Alert tone="danger" title="Não foi possível carregar">{feed.error}</Alert>
        ) : feed.loading && !feed.data ? (
          <SkeletonRows rows={6} />
        ) : items.length === 0 ? (
          <EmptyState title="Nenhum movimento ainda" description="Quando os grupos cadastrarem ou movimentarem algo, aparece aqui." />
        ) : (
          <Timeline
            entries={items.map((m) => ({
              id: m.id,
              at: m.at,
              actor: m.actor,
              tone: m.stock ? "info" : (TONE[m.action] ?? "neutral"),
              title: (
                <span className="flex flex-wrap items-center gap-1.5">
                  {!groupId && <Badge tone="neutral">{m.groupName}</Badge>}
                  <span>{m.stock ? `${m.action} de estoque` : `${ACTIONS[m.action] ?? m.action.toLowerCase()} · ${m.entity}`}</span>
                </span>
              ),
              description:
                m.changes.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {m.changes.map((c) => (
                      <li key={c.campo} className="break-words">
                        <span className="font-medium text-foreground">{c.campo}:</span>{" "}
                        {c.antes !== null && m.action !== "CREATE" ? (
                          <>
                            <span className="line-through">{c.antes}</span> → {c.depois ?? "(vazio)"}
                          </>
                        ) : (
                          c.depois ?? c.antes
                        )}
                      </li>
                    ))}
                  </ul>
                ) : undefined,
            }))}
          />
        )}
      </Panel>
    </div>
  );
}
