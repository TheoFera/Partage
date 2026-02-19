-- Exclude payment-processing costs from PLAT_PROD commission invoices.
-- Apply in Supabase SQL editor.

create or replace function public.create_platform_invoice_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_facture_id uuid;
  v_year integer := extract(year from now());
  v_seq integer;
  v_numero text;
  v_total_ttc_cents integer := 0;
  v_total_ht_cents integer := 0;
  v_total_tva_cents integer := 0;
  v_platform_fee_cents integer := 0;
  v_platform_profile_id uuid := 'd1d67cf6-0d41-4a05-95a0-335c15b15a05';
  v_vat_regime text := 'unknown';
  v_vat_rate numeric := 0;
  v_mention_tva text := null;
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.sharer_profile_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  if v_order.status <> 'distributed' and v_order.status <> 'finished' then
    raise exception 'Order not distributed';
  end if;

  select f.id
    into v_facture_id
  from public.factures f
  where f.order_id = v_order.id
    and f.serie = 'PLAT_PROD'
  limit 1;

  select coalesce(sum(lpb.value_cents * oi.quantity_units), 0)
    into v_platform_fee_cents
  from public.order_items oi
  join public.lot_price_breakdown lpb
    on lpb.lot_id = oi.lot_id
   and lpb.source = 'platform'
   -- Exclude payment-processing costs from commission.
   and coalesce(lower(lpb.platform_cost_code), '') not like any (
     array[
       '%paiement%',
       '%payment%',
       '%stancer%',
       '%stripe%',
       '%banc%',
       '%carte%',
       '%cb%'
     ]
   )
   and coalesce(lower(lpb.label), '') not like any (
     array[
       '%frais de paiement%',
       '%frais paiement%',
       '%paiement%',
       '%payment%',
       '%stancer%',
       '%stripe%',
       '%carte bancaire%',
       '%frais banc%'
     ]
   )
  where oi.order_id = v_order.id;

  if v_platform_fee_cents is null or v_platform_fee_cents = 0 then
    select coalesce(sum(oi.unit_base_price_cents * oi.quantity_units
      * (coalesce(p.platform_fee_percent, le.platform_fee_percent, ps.value_numeric, 10) / 100)), 0)
      into v_platform_fee_cents
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    left join lateral (
      select le.platform_fee_percent
      from public.legal_entities le
      where le.profile_id = p.producer_profile_id
      order by le.created_at desc
      limit 1
    ) le on true
    left join public.platform_settings ps on ps.key = 'platform_fee_percent'
    where oi.order_id = v_order.id;

    v_platform_fee_cents := round(v_platform_fee_cents);
  end if;

  select le.vat_regime
    into v_vat_regime
  from public.legal_entities le
  where le.profile_id = v_order.producer_profile_id
  order by le.created_at desc
  limit 1;

  if v_vat_regime = 'assujetti' then
    v_vat_rate := 0.20;
    v_mention_tva := null;
  elsif v_vat_regime = 'franchise' then
    v_vat_rate := 0;
    v_mention_tva := 'TVA non applicable, art. 293 B du CGI';
  else
    v_vat_rate := 0;
    v_mention_tva := null;
  end if;

  v_total_ttc_cents := greatest(0, v_platform_fee_cents);
  if v_vat_rate > 0 then
    v_total_ht_cents := public.calc_ht_cents_from_ttc(v_total_ttc_cents, v_vat_rate);
    v_total_tva_cents := public.calc_tva_cents_from_ttc(v_total_ttc_cents, v_vat_rate);
  else
    v_total_ht_cents := v_total_ttc_cents;
    v_total_tva_cents := 0;
  end if;

  if v_facture_id is null then
    if not exists (
      select 1 from public.facture_sequences_producteur
      where producer_profile_id = v_platform_profile_id
    ) then
      insert into public.facture_sequences_producteur (producer_profile_id, year, last_prod_client, last_plat_prod)
      values (v_platform_profile_id, v_year, 0, 0);
    else
      update public.facture_sequences_producteur
      set
        year = case when year <> v_year then v_year else year end,
        last_prod_client = case when year <> v_year then 0 else last_prod_client end,
        last_plat_prod = case when year <> v_year then 0 else last_plat_prod end,
        updated_at = now()
      where producer_profile_id = v_platform_profile_id;
    end if;

    update public.facture_sequences_producteur
    set
      last_plat_prod = last_plat_prod + 1,
      updated_at = now()
    where producer_profile_id = v_platform_profile_id
    returning last_plat_prod into v_seq;

    v_numero := format('PP-%s-%s', v_year, lpad(v_seq::text, 4, '0'));

    insert into public.factures (
      serie,
      producer_profile_id,
      order_id,
      payment_id,
      client_profile_id,
      numero,
      issued_at,
      currency,
      total_ttc_cents,
      total_ht_cents,
      total_tva_cents,
      mention_tva,
      seller_snapshot,
      buyer_snapshot,
      status
    ) values (
      'PLAT_PROD',
      v_platform_profile_id,
      v_order.id,
      null,
      v_order.producer_profile_id,
      v_numero,
      now(),
      v_order.currency,
      v_total_ttc_cents,
      v_total_ht_cents,
      v_total_tva_cents,
      v_mention_tva,
      '{}'::jsonb,
      '{}'::jsonb,
      'issued'
    )
    returning id into v_facture_id;
  else
    update public.factures
    set
      currency = v_order.currency,
      total_ttc_cents = v_total_ttc_cents,
      total_ht_cents = v_total_ht_cents,
      total_tva_cents = v_total_tva_cents,
      mention_tva = v_mention_tva,
      status = 'issued',
      updated_at = now()
    where id = v_facture_id;
  end if;

  delete from public.facture_lignes
  where facture_id = v_facture_id;

  insert into public.facture_lignes (
    facture_id,
    label,
    quantity,
    unit_ttc_cents,
    total_ttc_cents,
    vat_rate,
    total_ht_cents,
    total_tva_cents,
    metadata
  ) values (
    v_facture_id,
    'Commission plateforme',
    1,
    v_total_ttc_cents,
    v_total_ttc_cents,
    v_vat_rate,
    v_total_ht_cents,
    v_total_tva_cents,
    jsonb_build_object('component', 'platform_commission')
  );

  if not exists (
    select 1
    from public.emails_sortants
    where facture_id = v_facture_id
      and kind = 'FACTURE_PLATEFORME'
  ) then
    insert into public.emails_sortants (kind, status, to_profile_id, facture_id, payload)
    values ('FACTURE_PLATEFORME', 'pending', v_order.producer_profile_id, v_facture_id, '{}'::jsonb);
  end if;

  return jsonb_build_object('facture_id', v_facture_id);
end;
$function$;

-- Optional audit query:
-- select distinct platform_cost_code, label
-- from public.lot_price_breakdown
-- where source = 'platform'
-- order by 1, 2;
