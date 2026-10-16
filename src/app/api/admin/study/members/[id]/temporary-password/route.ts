import { issueStudyMemberTemporaryPassword, revokeStudyMemberTemporaryPassword } from "@/lib/auth/temporary-password-handlers";

// Senha provisória de um aluno de grupo da turma (Modo Estudo).
export const POST = issueStudyMemberTemporaryPassword;
export const DELETE = revokeStudyMemberTemporaryPassword;
