import { redirect } from "next/navigation";

// Os KPIs de controladoria agora vivem no painel de controladoria.
export default function KpisPage() {
  redirect("/gestao/dashboard/controladoria");
}
