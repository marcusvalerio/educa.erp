import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Definir senha" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
