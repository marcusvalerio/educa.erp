import { ModulePage } from "@/components/ModulePage";
import { getPageConfig } from "@/lib/pages";
import { notFound } from "next/navigation";

export default function Page() {
  const config = getPageConfig("fiscal", "notas-fiscais");
  if (!config) notFound();
  return <ModulePage config={config} />;
}
