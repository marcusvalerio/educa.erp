"use client";

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import type { FormSection } from "@/lib/cadastros/form-types";
import type { FieldErrors } from "@/lib/cadastros/validation";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Alert } from "@/components/ui/Feedback";
import { EntityForm, type EntityFormMode } from "./EntityForm";

type EntityDrawerProps = {
  open: boolean;
  mode: EntityFormMode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  sections: FormSection[];
  values: Record<string, unknown>;
  errors: FieldErrors;
  dirty: boolean;
  saving?: boolean;
  canEdit?: boolean;
  onChange: (key: string, value: string | number | boolean) => void;
  onClose: () => void;
  onSave: () => void;
  onEdit: () => void;
  extras?: ReactNode;
};

// Formulário em painel lateral: criação, edição e visualização. Protege
// alterações não salvas (confirmação ao fechar) e mostra o resumo de
// erros no topo, além do erro junto a cada campo.
export function EntityDrawer({
  open,
  mode,
  title,
  subtitle,
  meta,
  sections,
  values,
  errors,
  dirty,
  saving = false,
  canEdit = true,
  onChange,
  onClose,
  onSave,
  onEdit,
  extras,
}: EntityDrawerProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const errorCount = Object.keys(errors).length;

  function requestClose() {
    if (saving) return;
    if (mode !== "view" && dirty) setConfirmDiscard(true);
    else onClose();
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={requestClose}
        title={title}
        subtitle={subtitle}
        meta={meta}
        size="lg"
        footer={
          mode === "view" ? (
            <>
              <Button variant="secondary" onClick={onClose}>
                Fechar
              </Button>
              {canEdit && (
                <Button onClick={onEdit}>
                  <Pencil size={14} /> Editar
                </Button>
              )}
            </>
          ) : (
            <>
              {dirty && <span className="mr-auto text-xs text-subtle-foreground">Alterações não salvas</span>}
              <Button variant="secondary" onClick={requestClose} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={onSave} loading={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </>
          )
        }
      >
        <form
          className="flex flex-col gap-6"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (mode !== "view") onSave();
          }}
        >
          {errorCount > 0 && (
            <Alert tone="danger" title="Revise os campos destacados">
              {errorCount === 1 ? "Há 1 campo com problema." : `Há ${errorCount} campos com problema.`}
            </Alert>
          )}
          <EntityForm sections={sections} values={values} errors={errors} mode={mode} onChange={onChange} />
          {mode === "view" && extras && <div className="flex flex-col gap-6 border-t border-border pt-5">{extras}</div>}
        </form>
      </Drawer>
      <ConfirmDialog
        open={confirmDiscard}
        title="Descartar alterações?"
        description="As alterações feitas neste formulário ainda não foram salvas e serão perdidas."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        tone="danger"
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}
