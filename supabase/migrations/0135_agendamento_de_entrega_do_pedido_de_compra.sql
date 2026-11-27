-- 0135 — Agendamento de entrega do pedido de compra (Suprimentos › Agendamentos).
-- expected_delivery_at (0016) é só data; o agendamento precisa da hora.
-- Coluna nova, opcional, idempotente. Nenhum dado existente é alterado.
alter table public.purchase_orders add column if not exists delivery_scheduled_at timestamptz;

create index if not exists purchase_orders_delivery_scheduled_idx
  on public.purchase_orders (company_id, delivery_scheduled_at)
  where delivery_scheduled_at is not null;
