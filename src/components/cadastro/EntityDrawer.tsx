"use client";

import type { FormSection } from "@/lib/cadastros/form-types";
import type { FieldErrors } from "@/lib/cadastros/validation";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { EntityForm, type EntityFormMode } from "./EntityForm";
import { Pencil, AlertTriangle } from "lucide-react";

type EntityDrawerProps = {
  open: boolean;
  mode: EntityFormMode;
  title: string;
  subtitle?: string;
  sections: FormSection[];
  values: Record<string, unknown>;
  errors: FieldErrors;
  onChange: (key: string, value: string | number | boolean) => void;
  onClose: () => void;
  onSave: () => void;
  onEdit: () => void;
  extras?: React.ReactNode;
  saving?: boolean;
  /** Erro que não pertence a um campo específico (ex.: falha do servidor ao salvar). */
  formError?: string | null;
};

export function EntityDrawer({
  open,
  mode,
  title,
  subtitle,
  sections,
  values,
  errors,
  onChange,
  onClose,
  onSave,
  onEdit,
  extras,
  saving = false,
  formError,
}: EntityDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        mode === "view" ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            <Button onClick={onEdit}>
              <Pencil size={15} />
              Editar
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-6">
        {formError && (
          <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft/60 px-3.5 py-3 text-[13px] text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" strokeWidth={1.75} />
            <span>{formError}</span>
          </div>
        )}
        <EntityForm sections={sections} values={values} errors={errors} mode={mode} onChange={onChange} />
        {mode === "view" && extras && (
          <div className="flex flex-col gap-5 border-t border-border pt-5">{extras}</div>
        )}
      </div>
    </Drawer>
  );
}
