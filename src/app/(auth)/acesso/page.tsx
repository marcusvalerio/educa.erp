import type { Metadata } from "next";
import { AccessGate } from "./AccessGate";

export const metadata: Metadata = { title: "Acesso" };

export default function AccessPage() {
  return <AccessGate />;
}
