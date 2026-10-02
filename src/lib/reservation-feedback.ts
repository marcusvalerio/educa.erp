// Mensagem mostrada depois de "Reservar estoque" no pedido de venda.
// A reserva reserva só o que o local escolhido tem disponível; o resto fica
// pendente (status "Reserva pendente"). A mensagem compara o reservado antes
// e depois da chamada para nunca anunciar sucesso de uma reserva parcial.

export type ReservationFeedback = { tone: "success" | "warning"; title: string; description: string };

const qty = (n: number) => n.toLocaleString("pt-BR");
const units = (n: number) => `${qty(n)} unidade${n === 1 ? "" : "s"}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function reservationFeedback(reservedBefore: number, reservedAfter: number, ordered: number): ReservationFeedback {
  const added = Math.max(0, reservedAfter - reservedBefore);
  const pending = Math.max(0, ordered - reservedAfter);
  if (pending === 0) {
    return {
      tone: "success",
      title: "Estoque reservado.",
      description: `${qty(reservedAfter)} de ${units(ordered)} ${plural(ordered, "reservada", "reservadas")}.`,
    };
  }
  if (added > 0) {
    return {
      tone: "warning",
      title: "Reserva parcial.",
      description:
        `${units(added)} ${plural(added, "reservada", "reservadas")} neste local; ` +
        `${units(pending)} ${plural(pending, "ficou pendente", "ficaram pendentes")}. ` +
        "Reserve o restante em outro local ou depois de abastecer este.",
    };
  }
  return {
    tone: "warning",
    title: "Nenhuma unidade reservada.",
    description: "O local escolhido não tem saldo disponível para os itens pendentes. Confira o Saldo de estoque e escolha outro local.",
  };
}
