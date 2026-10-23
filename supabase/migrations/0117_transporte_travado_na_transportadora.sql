-- 0117 — Transporte da expedição: motorista e veículo travados na transportadora.
--
-- Antes, motorista/veículo sem transportadora (frota própria) passavam com
-- qualquer transportadora, e com a transportadora em branco passava motorista
-- de qualquer transportadora. Agora tem de bater: transportadora escolhida →
-- só motorista/veículo dela; sem transportadora → só frota própria. A tela já
-- filtra as listas; aqui o banco garante. Pode rodar de novo.

CREATE OR REPLACE FUNCTION public.fn_assign_shipment_transport(p_shipment_id uuid, p_carrier_id uuid DEFAULT NULL::uuid, p_driver_id uuid DEFAULT NULL::uuid, p_vehicle_id uuid DEFAULT NULL::uuid)
 RETURNS shipments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_shipment public.shipments;
  v_driver public.drivers;
  v_vehicle public.vehicles;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if not found then
    raise exception 'Expedição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_shipment.company_id, 'shipments.update') then
    raise exception 'Permissão negada (shipments.update).' using errcode = '42501';
  end if;

  if v_shipment.status in ('shipped', 'in_transit', 'delivered', 'completed', 'cancelled') then
    raise exception 'Não é possível alterar o transporte de uma expedição no status %.', v_shipment.status using errcode = 'P0001';
  end if;

  if p_driver_id is not null then
    select * into v_driver from public.drivers where id = p_driver_id and company_id = v_shipment.company_id;
    if not found then
      raise exception 'Motorista não encontrado.' using errcode = 'P0002';
    end if;
    if v_driver.carrier_id is distinct from p_carrier_id then
      if p_carrier_id is null then
        raise exception 'Este motorista é de uma transportadora: escolha a transportadora dele.' using errcode = 'P0001';
      elsif v_driver.carrier_id is null then
        raise exception 'Este motorista é da frota própria, não da transportadora escolhida.' using errcode = 'P0001';
      end if;
      raise exception 'Motorista não pertence à transportadora informada.' using errcode = 'P0001';
    end if;
  end if;

  if p_vehicle_id is not null then
    select * into v_vehicle from public.vehicles where id = p_vehicle_id and company_id = v_shipment.company_id;
    if not found then
      raise exception 'Veículo não encontrado.' using errcode = 'P0002';
    end if;
    if v_vehicle.carrier_id is distinct from p_carrier_id then
      if p_carrier_id is null then
        raise exception 'Este veículo é de uma transportadora: escolha a transportadora dele.' using errcode = 'P0001';
      elsif v_vehicle.carrier_id is null then
        raise exception 'Este veículo é da frota própria, não da transportadora escolhida.' using errcode = 'P0001';
      end if;
      raise exception 'Veículo não pertence à transportadora informada.' using errcode = 'P0001';
    end if;
    if v_vehicle.driver_id is not null and p_driver_id is not null and v_vehicle.driver_id <> p_driver_id then
      raise exception 'Veículo está vinculado a outro motorista.' using errcode = 'P0001';
    end if;
  end if;

  update public.shipments
  set carrier_id = p_carrier_id, driver_id = p_driver_id, vehicle_id = p_vehicle_id
  where id = p_shipment_id
  returning * into v_shipment;

  return v_shipment;
end;
$function$;
