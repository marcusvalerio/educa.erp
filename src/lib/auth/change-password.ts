// Troca de senha com o usuário logado (sem Next.js: testável).
//
// Regras, iguais nos dois provedores:
//   * só com sessão válida (a identidade vem da sessão, nunca do corpo);
//   * a senha atual é conferida antes de qualquer mudança;
//   * a senha nova segue a política (newPasswordSchema) e não pode ser igual à atual;
//   * as demais sessões do usuário são encerradas; a sessão atual continua.

import { z } from "zod";
import { newPasswordSchema } from "@/lib/onboarding/invitations";

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual.").max(256),
    newPassword: newPasswordSchema,
  })
  .strict()
  .refine((v) => v.currentPassword !== v.newPassword, { message: "A nova senha precisa ser diferente da atual.", path: ["newPassword"] });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export type ChangePasswordOutcome = "changed" | "no_session" | "wrong_password";

export type ChangePasswordDeps = {
  /** E-mail do login da sessão atual, ou null sem sessão válida. */
  currentEmail: () => Promise<string | null>;
  /** Confere a senha atual. false = senha errada. */
  verifyCurrent: (email: string, password: string) => Promise<boolean>;
  /** Grava a senha nova e encerra as demais sessões. */
  apply: (input: ChangePasswordInput) => Promise<void>;
};

export async function changePasswordFlow(input: ChangePasswordInput, deps: ChangePasswordDeps): Promise<ChangePasswordOutcome> {
  const email = await deps.currentEmail();
  if (!email) return "no_session";
  if (!(await deps.verifyCurrent(email, input.currentPassword))) return "wrong_password";
  await deps.apply(input);
  return "changed";
}
