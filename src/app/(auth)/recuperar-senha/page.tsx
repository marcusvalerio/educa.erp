import type { Metadata } from "next";
import { RecoverPasswordForm } from "./RecoverPasswordForm";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecoverPasswordPage() {
  return <RecoverPasswordForm />;
}
