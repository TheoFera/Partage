-- Objectif:
-- 1) Aligner le calcul de la commission PLAT_PROD sur le calcul "avant facture" du front.
-- 2) Permettre la re-generation des anciennes factures PLAT_PROD calculees avec l'ancienne logique.
--
-- Pourquoi cette modif:
-- - Avant facture, le front calcule une estimation locale.
-- - Apres facture, l'UI lit factures/facture_lignes.
-- - Si les deux logiques divergent, l'utilisateur voit un ecart.
--
-- Principe applique ici:
-- - commission = platform_from_lots + ajustement silencieux des deltas d'arrondi livraison
-- - platform_from_lots:
--   somme de toutes les lignes lot_price_breakdown(source='platform', value_type='cents')
--   par lot utilise, multipliee par les unites commandees du lot
-- - delivery_rounding_delta_cents:
--   somme(order_items.unit_delivery_cents * quantity_units)
--   moins le montant global de livraison du beneficiaire reel du mode de livraison
-- - aucune ligne fallback
-- - si une ligne de commande n'est pas couverte par un lot valide -> erreur explicite
-- - frais de paiement restent informatifs
-- - le delta d'arrondi livraison est absorbe dans la commission plateforme sans ligne visible dediee.
--
-- Important:
-- - la creation SQL de la facture PLAT_PROD est correcte avec cette logique.
-- - si la facture se recrit ensuite avec une ancienne logique, la cause est hors de cette fonction,
--   typiquement dans le flux declenche par call_process_emails_sortants() si l'edge function
--   deployee n'est pas synchronisee avec ce repo.

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
  v_platform_from_lots_cents integer := 0;
  v_delivery_allocated_from_items_cents integer := 0;
  v_delivery_beneficiary_cents integer := 0;
  v_delivery_rounding_delta_cents integer := 0;
  v_platform_profile_id uuid := 'd1d67cf6-0d41-4a05-95a0-335c15b15a05';
  v_vat_regime text := 'unknown';
  v_vat_rate numeric := 0;
  v_mention_tva text := null;
  v_payment_fees_ttc_cents integer := 0;
  v_delivery_fee_to_platform_cents integer := 0;
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

  -- Validation stricte: chaque ligne de commande doit etre rattachee a un lot.
  if exists (
    select 1
    from public.order_items oi
    where oi.order_id = v_order.id
      and oi.lot_id is null
  ) then
    raise exception
      'Commission plateforme impossible: au moins une ligne de commande est sans lot (order_id=%).',
      v_order.id;
  end if;

  -- Validation stricte: chaque lot utilise doit avoir au moins une ligne platform.
  if exists (
    with order_lots as (
      select distinct oi.lot_id
      from public.order_items oi
      where oi.order_id = v_order.id
        and oi.lot_id is not null
    )
    select 1
    from order_lots ol
    where not exists (
      select 1
      from public.lot_price_breakdown lpb
      where lpb.lot_id = ol.lot_id
        and lpb.source = 'platform'
    )
  ) then
    raise exception
      'Commission plateforme impossible: au moins un lot de la commande n''est pas couvert par lot_price_breakdown(source=platform) (order_id=%).',
      v_order.id;
  end if;

  if exists (
    with order_lots as (
      select distinct oi.lot_id
      from public.order_items oi
      where oi.order_id = v_order.id
        and oi.lot_id is not null
    )
    select 1
    from public.lot_price_breakdown lpb
    join order_lots ol on ol.lot_id = lpb.lot_id
    where lpb.source = 'platform'
      and coalesce(lower(lpb.value_type::text), '') <> 'cents'
  ) then
    raise exception
      'Commission plateforme impossible: value_type doit etre ''cents'' pour les lignes platform (order_id=%).',
      v_order.id;
  end if;

  -- Part A unique: commission depuis les lots couverts en cents.
  -- Plusieurs lignes platform par lot sont autorisees: on les somme.
  with lot_items as (
    select
      oi.id,
      oi.lot_id,
      coalesce(oi.quantity_units, 0)::int as qty
    from public.order_items oi
    where oi.order_id = v_order.id
      and oi.lot_id is not null
  ),
  lot_unit_totals as (
    select
      li.lot_id,
      coalesce(sum(li.qty), 0)::int as units
    from lot_items li
    group by li.lot_id
  ),
  lot_platform_rows as (
    select
      lpb.lot_id,
      lut.units,
      coalesce(lpb.value_cents, 0)::int as value_per_unit_cents
    from public.lot_price_breakdown lpb
    join lot_unit_totals lut on lut.lot_id = lpb.lot_id
    where lpb.source = 'platform'
      and coalesce(lower(lpb.value_type::text), '') = 'cents'
  )
  select coalesce(sum(lpr.value_per_unit_cents * lpr.units), 0)::int
    into v_platform_from_lots_cents
  from lot_platform_rows lpr;

  select coalesce(sum(coalesce(oi.unit_delivery_cents, 0) * coalesce(oi.quantity_units, 0)), 0)::int
    into v_delivery_allocated_from_items_cents
  from public.order_items oi
  where oi.order_id = v_order.id;

  v_delivery_beneficiary_cents := case
    when v_order.delivery_option = 'producer_pickup' then greatest(coalesce(v_order.pickup_delivery_fee_cents, 0), 0)
    when v_order.delivery_option in ('producer_delivery', 'chronofresh') then greatest(coalesce(v_order.delivery_fee_cents, 0), 0)
    else 0
  end;

  v_delivery_rounding_delta_cents :=
    coalesce(v_delivery_allocated_from_items_cents, 0) - coalesce(v_delivery_beneficiary_cents, 0);

  v_platform_fee_cents :=
    greatest(0, coalesce(v_platform_from_lots_cents, 0) + coalesce(v_delivery_rounding_delta_cents, 0));

  -- Informatif uniquement, non ajoute a la commission.
  select coalesce(sum(coalesce(pay.fee_cents, 0) + coalesce(pay.fee_vat_cents, 0)), 0)
    into v_payment_fees_ttc_cents
  from public.payments pay
  where pay.order_id = v_order.id
    and pay.status in ('paid', 'authorized');

  v_delivery_fee_to_platform_cents := case
    when v_order.delivery_option = 'chronofresh' then greatest(coalesce(v_order.delivery_fee_cents, 0), 0)
    else 0
  end;

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
      select 1
      from public.facture_sequences_producteur
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
    'Commission de la plateforme',
    1,
    v_total_ttc_cents,
    v_total_ttc_cents,
    v_vat_rate,
    v_total_ht_cents,
    v_total_tva_cents,
    jsonb_build_object(
      'component', 'platform_commission',
      'source', 'lot_plus_delivery_rounding_delta',
      'generator_version', 'plat_prod_single_version_2026_03_14_delivery_rounding',
      'lot_platform_cents', v_platform_from_lots_cents,
      'delivery_allocated_from_items_cents', v_delivery_allocated_from_items_cents,
      'delivery_beneficiary_cents', v_delivery_beneficiary_cents,
      'delivery_rounding_delta_cents', v_delivery_rounding_delta_cents,
      'fallback_non_covered_cents', 0,
      'fallback_enabled', false,
      'payment_fees_ttc_cents', v_payment_fees_ttc_cents,
      'delivery_fee_to_platform_cents', v_delivery_fee_to_platform_cents
    )
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

-- --------------------------------------------------------------------
-- Reparation optionnelle (factures PLAT_PROD deja calculees ancienne logique)
-- --------------------------------------------------------------------
-- Ce bloc recalcule les factures PLAT_PROD dont la ligne de commission
-- indique source='plat_prod_breakdown', en reutilisant la nouvelle fonction.
-- Le set_config sert uniquement a satisfaire le controle auth.uid() de la fonction.
do $$
declare
  r record;
begin
  for r in
    select distinct
      f.order_id,
      o.sharer_profile_id
    from public.factures f
    join public.facture_lignes fl on fl.facture_id = f.id
    join public.orders o on o.id = f.order_id
    where f.serie = 'PLAT_PROD'
      and coalesce(fl.metadata->>'component', '') = 'platform_commission'
      and coalesce(fl.metadata->>'source', '') = 'plat_prod_breakdown'
  loop
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'role', 'authenticated',
        'sub', r.sharer_profile_id::text
      )::text,
      true
    );

    perform public.create_platform_invoice_for_order(r.order_id);
  end loop;
end
$$;

-- --------------------------------------------------------------------
-- Wrapper unique de creation + envoi
-- --------------------------------------------------------------------
create or replace function public.create_platform_invoice_and_send_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  v_result := public.create_platform_invoice_for_order(p_order_id);
  perform public.call_process_emails_sortants();
  return v_result;
end;
$function$;

create or replace function public.admin_create_platform_invoice_and_send_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_prev_sub text;
  v_prev_claims text;
  v_prev_role text;
  v_result jsonb;
begin
  if current_user <> 'postgres' then
    raise exception 'Admin only';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.sharer_profile_id is null then
    raise exception 'Order sharer_profile_id missing';
  end if;

  v_prev_sub := current_setting('request.jwt.claim.sub', true);
  v_prev_claims := current_setting('request.jwt.claims', true);
  v_prev_role := current_setting('request.jwt.claim.role', true);

  perform set_config('request.jwt.claim.sub', v_order.sharer_profile_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_order.sharer_profile_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_result := public.create_platform_invoice_and_send_for_order(p_order_id);

  perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(v_prev_role, ''), true);

  return v_result;
end;
$function$;

drop function if exists public.admin_create_platform_invoice_and_send_for_order_v2(uuid);
drop function if exists public.create_platform_invoice_and_send_for_order_v2(uuid);
drop function if exists public.create_platform_invoice_for_order_v2(uuid);

grant execute on function public.create_platform_invoice_for_order(uuid) to authenticated, service_role;
grant execute on function public.create_platform_invoice_and_send_for_order(uuid) to authenticated, service_role;
grant execute on function public.admin_create_platform_invoice_and_send_for_order(uuid) to service_role;

notify pgrst, 'reload schema';
