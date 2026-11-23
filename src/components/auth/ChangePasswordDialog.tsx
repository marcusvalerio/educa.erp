"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { apiSend } from "@/lib/api-client";

// Trocar a própria senha, com a sessão aberta. Confere a senha atual no
// servidor; as outras sessões do usuário são encerradas, esta continua.

type Errors = { current?: string; password?: string; confirm?: string; form?: string };

function validate(current: string, password: string, confirm: string): Errors {
  const e: Errors = {};
  if (!current) e.current = "Informe a senha atual.";
  if (password.length < 8 || password.length > 72) e.password = "Use de 8 a 72 caracteres.";
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) e.password = "Use letras e números na senha.";
  else if (password === current) e.password = "A nova senha precisa ser diferente da atual.";
  if (!e.password && confirm !== password) e.confirm = "As senhas não conferem.";
  return e;
}

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  function reset() {
    setCurrent("");
    setPassword("");
    setConfirm("");
    setErrors({});
  }

  function handleOpenChange(next: boolean) {
    if (saving) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validate(current, password, confirm);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await apiSend("/api/auth/password/change", "POST", { currentPassword: current, newPassword: password });
      toast.success("Senha alterada. As outras sessões foram encerradas.");
      reset();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível trocar a senha.";
      setErrors(/senha atual/i.test(message) ? { current: message } : { form: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} title="Trocar senha" description="Depois da troca, as outras sessões abertas com a sua conta são encerradas." size="sm">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {errors.form && <Alert tone="danger">{errors.form}</Alert>}
        <FormField label="Senha atual" required error={errors.current}>
          <PasswordInput autoComplete="current-password" value={current} onChange={setCurrent} />
        </FormField>
        <FormField label="Nova senha" required error={errors.password} help="Mínimo de 8 caracteres, com letras e números.">
          <PasswordInput autoComplete="new-password" value={password} onChange={setPassword} />
        </FormField>
        <FormField label="Confirme a nova senha" required error={errors.confirm}>
          <PasswordInput autoComplete="new-password" value={confirm} onChange={setConfirm} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Salvar nova senha
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
