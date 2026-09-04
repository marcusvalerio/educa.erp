import { ModuleLanding } from "@/components/ModuleLanding";
import { NAV, childHref } from "@/lib/nav";
import { getPageConfig } from "@/lib/pages";
import { notFound } from "next/navigation";

export default function Page() {
  const mod = NAV.find((m) => m.slug === "logistica");
  if (!mod) notFound();

  const items = mod.children.map((child) => ({
    label: child.label,
    href: childHref(mod, child),
    description: getPageConfig(mod.slug, child.slug)?.description ?? "",
  }));

  return <ModuleLanding label={mod.label} description={mod.description} items={items} />;
}
