-- Proposition 1
-- Objectif:
-- 1) Conserver la logique economique actuelle de part partageur unitaire.
-- 2) Remplacer la part partageur globale approximative par une somme exacte
--    des unit_sharer_fee_cents des lignes reellement commandees.
-- 3) Garder pickup_delivery_fee_cents comme composante separee de recuperation.

create or replace function public.compute_order_sharer_product_share_cents(p_order_id uuid)
returns integer
language sql
security definer
set search_path to 'public'
stable
as $function$
  -- Part partageur sur les produits uniquement:
  -- somme exacte des unit_sharer_fee_cents de toutes les lignes commandees.
  -- La recuperation producer_pickup reste geree a part via pickup_delivery_fee_cents.
  select coalesce(sum(greatest(coalesce(oi.unit_sharer_fee_cents, 0), 0) * greatest(coalesce(oi.quantity_units, 0), 0)), 0)::int
  from public.order_items oi
  where oi.order_id = p_order_id;
$function$;

create or replace function public.finalize_order_pricing(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_delivery_option text;
  v_min_weight numeric := 0;
  v_max_weight numeric := 0;
  v_effective_weight numeric := 0;
  v_total_weight numeric := 0;
  v_pickup_fee int := 0;
  v_base_delivery_fee int := 0;
  v_delivery_fee_total int := 0;
  v_sharer_percentage numeric := 0;
  v_share_fraction numeric := 0;
  v_fee_per_kg numeric := 0;
  v_sharer_participant_id uuid;
  v_sharer_product_share_cents integer := 0;
begin
  select
    o.delivery_option,
    o.min_weight_kg,
    o.max_weight_kg,
    o.pickup_delivery_fee_cents,
    o.delivery_fee_cents,
    o.sharer_percentage
  into
    v_delivery_option,
    v_min_weight,
    v_max_weight,
    v_pickup_fee,
    v_base_delivery_fee,
    v_sharer_percentage
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  select op.id
    into v_sharer_participant_id
  from public.order_participants op
  where op.order_id = p_order_id
    and op.role = 'sharer'
  limit 1;

  if v_sharer_participant_id is null then
    raise exception 'Sharer participant not found';
  end if;

  select coalesce(sum(oi.unit_weight_kg * oi.quantity_units), 0)
    into v_total_weight
  from public.order_items oi
  where oi.order_id = p_order_id;

  if v_max_weight > 0 then
    v_effective_weight := least(greatest(v_total_weight, greatest(v_min_weight, 0)), v_max_weight);
  else
    v_effective_weight := greatest(v_total_weight, greatest(v_min_weight, 0));
  end if;

  if v_delivery_option = 'producer_pickup' then
    v_delivery_fee_total := coalesce(v_pickup_fee, 0);
  elsif v_delivery_option = 'producer_delivery' then
    v_delivery_fee_total := coalesce(v_base_delivery_fee, 0);
  else
    if v_effective_weight > 0 then
      v_delivery_fee_total := greatest(15, 5 * round((7 + 8 * sqrt(v_effective_weight)) / 5));
    else
      v_delivery_fee_total := 0;
    end if;
  end if;

  if v_sharer_percentage > 0 and v_sharer_percentage < 100 then
    v_share_fraction := v_sharer_percentage / (100 - v_sharer_percentage);
  else
    v_share_fraction := 0;
  end if;

  v_fee_per_kg := case
    when v_effective_weight > 0 then (v_delivery_fee_total::numeric / v_effective_weight)
    else 0
  end;

  -- IMPORTANT: reprice only sharer lines at close.
  -- Non-sharer participant lines remain frozen at purchase-time values.
  update public.order_items oi
  set
    unit_delivery_cents =
      round(v_fee_per_kg * oi.unit_weight_kg)::int,
    unit_sharer_fee_cents =
      round(
        (oi.unit_base_price_cents + round(v_fee_per_kg * oi.unit_weight_kg)::int)
        * v_share_fraction
      )::int,
    unit_final_price_cents =
      oi.unit_base_price_cents
      + round(v_fee_per_kg * oi.unit_weight_kg)::int
      + round(
        (oi.unit_base_price_cents + round(v_fee_per_kg * oi.unit_weight_kg)::int)
        * v_share_fraction
      )::int,
    line_total_cents =
      (
        oi.unit_base_price_cents
        + round(v_fee_per_kg * oi.unit_weight_kg)::int
        + round(
          (oi.unit_base_price_cents + round(v_fee_per_kg * oi.unit_weight_kg)::int)
          * v_share_fraction
        )::int
      ) * oi.quantity_units,
    line_weight_kg = oi.unit_weight_kg * oi.quantity_units
  where oi.order_id = p_order_id
    and oi.participant_id = v_sharer_participant_id;

  select public.compute_order_sharer_product_share_cents(p_order_id)
    into v_sharer_product_share_cents;

  update public.orders o
  set
    sharer_share_cents = v_sharer_product_share_cents,
    effective_weight_kg = v_effective_weight,
    updated_at = now()
  where o.id = p_order_id;

  perform public.recompute_order_caches(p_order_id, null);
end;
$function$;

create or replace function public.create_lock_close_package(p_order_id uuid, p_use_coop_balance boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_sharer_participant_id uuid;
  v_sharer_products_value_cents integer := 0;
  v_sharer_product_share_cents integer := 0;
  v_sharer_pickup_share_cents integer := 0;
  v_sharer_share_final_cents integer := 0;
  v_sharer_discount_cents integer := 0;
  v_coop_surplus_cents integer := 0;
  v_required_after_share_cents integer := 0;
  v_paid_cents integer := 0;
  v_balance_cents integer := 0;
  v_coop_to_consume integer := 0;
  v_sharer_invoice_id uuid;
  v_email_dispatch_requested boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.sharer_profile_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  if v_order.status = 'open' then
    perform public.set_order_status(p_order_id, 'locked');
  elsif v_order.status <> 'locked' then
    raise exception 'Order not closable from status %', v_order.status;
  end if;

  perform public.finalize_order_pricing(p_order_id);

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  select op.id
    into v_sharer_participant_id
  from public.order_participants op
  where op.order_id = p_order_id
    and op.role = 'sharer'
  limit 1;

  if v_sharer_participant_id is null then
    raise exception 'Sharer participant not found';
  end if;

  select coalesce(sum(oi.line_total_cents), 0)
    into v_sharer_products_value_cents
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.participant_id = v_sharer_participant_id;

  select public.compute_order_sharer_product_share_cents(p_order_id)
    into v_sharer_product_share_cents;

  v_sharer_pickup_share_cents := case
    when v_order.delivery_option = 'producer_pickup'
      then greatest(0, coalesce(v_order.pickup_delivery_fee_cents, 0))
    else 0
  end;

  v_sharer_share_final_cents := v_sharer_product_share_cents + v_sharer_pickup_share_cents;

  v_sharer_discount_cents := least(v_sharer_share_final_cents, v_sharer_products_value_cents);
  v_coop_surplus_cents := greatest(0, v_sharer_share_final_cents - v_sharer_products_value_cents);
  v_required_after_share_cents := greatest(0, v_sharer_products_value_cents - v_sharer_share_final_cents);

  select coalesce(sum(greatest(0, p.amount_cents - coalesce(p.refunded_amount_cents, 0))), 0)
    into v_paid_cents
  from public.payments p
  where p.order_id = p_order_id
    and p.participant_id = v_sharer_participant_id
    and p.status in ('paid', 'authorized');

  if p_use_coop_balance and v_required_after_share_cents > v_paid_cents then
    select coalesce(cb.balance_cents, 0)
      into v_balance_cents
    from public.coop_balances cb
    where cb.profile_id = v_order.sharer_profile_id
    for update;

    v_coop_to_consume :=
      least(greatest(0, v_balance_cents), greatest(0, v_required_after_share_cents - v_paid_cents));

    if v_coop_to_consume > 0 then
      perform public.consume_coop_balance(v_order.sharer_profile_id, p_order_id, v_coop_to_consume);
    end if;
  end if;

  if v_paid_cents + v_coop_to_consume < v_required_after_share_cents then
    raise exception 'Insufficient funds for close: required %, paid %, coop %',
      v_required_after_share_cents, v_paid_cents, v_coop_to_consume;
  end if;

  perform public.apply_coop_gains(p_order_id);

  v_sharer_invoice_id := public.issue_sharer_invoice_after_lock(p_order_id);
  if v_sharer_invoice_id is null then
    raise exception 'Sharer invoice generation failed for order %', p_order_id;
  end if;

  perform public.create_auto_invoice_for_pro_sharer(p_order_id);

  begin
    perform public.call_process_emails_sortants();
    v_email_dispatch_requested := true;
  exception
    when others then
      v_email_dispatch_requested := false;
  end;

  return jsonb_build_object(
    'ok', true,
    'sharer_invoice_id', v_sharer_invoice_id,
    'email_dispatch_requested', v_email_dispatch_requested,
    'coop_consumed_cents', v_coop_to_consume,
    'required_after_share_cents', v_required_after_share_cents,
    'paid_cents', v_paid_cents,
    'sharer_product_share_cents', v_sharer_product_share_cents,
    'sharer_pickup_share_cents', v_sharer_pickup_share_cents,
    'sharer_share_final_cents', v_sharer_share_final_cents,
    'sharer_products_value_cents', v_sharer_products_value_cents,
    'sharer_discount_cents', v_sharer_discount_cents,
    'coop_surplus_cents', v_coop_surplus_cents
  );
end;
$function$;

create or replace function public.issue_sharer_invoice_after_lock(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_sharer_participant_id uuid;
  v_invoice_id uuid;
  v_numero text;
  v_total_ttc_cents integer := 0;
  v_total_ht_cents integer := 0;
  v_total_tva_cents integer := 0;
  v_sharer_products_value_cents integer := 0;
  v_sharer_product_share_cents integer := 0;
  v_sharer_pickup_share_cents integer := 0;
  v_sharer_share_final_cents integer := 0;
  v_sharer_discount_cents integer := 0;
  v_discount_remaining_cents integer := 0;
  v_bucket record;
  v_bucket_discount_cents integer := 0;
  v_bucket_ht_cents integer := 0;
  v_bucket_tva_cents integer := 0;
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

  select op.id
    into v_sharer_participant_id
  from public.order_participants op
  where op.order_id = p_order_id
    and op.role = 'sharer'
  limit 1;

  if v_sharer_participant_id is null then
    raise exception 'Sharer participant not found';
  end if;

  select f.id
    into v_invoice_id
  from public.factures f
  where f.order_id = p_order_id
    and f.serie = 'PROD_CLIENT'
    and f.client_profile_id = v_order.sharer_profile_id
    and f.producer_profile_id = v_order.producer_profile_id
  limit 1;

  if v_invoice_id is null then
    v_numero := public.next_facture_numero_producteur(v_order.producer_profile_id, 'PROD_CLIENT', current_date);

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
      'PROD_CLIENT',
      v_order.producer_profile_id,
      p_order_id,
      null,
      v_order.sharer_profile_id,
      v_numero,
      now(),
      v_order.currency,
      0,
      0,
      0,
      null,
      '{}'::jsonb,
      '{}'::jsonb,
      'issued'
    )
    returning id into v_invoice_id;
  else
    delete from public.facture_lignes
    where facture_id = v_invoice_id;
  end if;

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
  )
  select
    v_invoice_id,
    coalesce(p.name, 'Produit'),
    oi.quantity_units,
    oi.unit_final_price_cents,
    oi.line_total_cents,
    coalesce(p.vat_rate, 0),
    public.calc_ht_cents_from_ttc(oi.line_total_cents, coalesce(p.vat_rate, 0)),
    public.calc_tva_cents_from_ttc(oi.line_total_cents, coalesce(p.vat_rate, 0)),
    jsonb_build_object(
      'component', 'sharer_product',
      'order_item_id', oi.id,
      'product_id', oi.product_id
    )
  from public.order_items oi
  left join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id
    and oi.participant_id = v_sharer_participant_id;

  select coalesce(sum(oi.line_total_cents), 0)
    into v_sharer_products_value_cents
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.participant_id = v_sharer_participant_id;

  select public.compute_order_sharer_product_share_cents(p_order_id)
    into v_sharer_product_share_cents;

  v_sharer_pickup_share_cents := case
    when v_order.delivery_option = 'producer_pickup'
      then greatest(0, coalesce(v_order.pickup_delivery_fee_cents, 0))
    else 0
  end;

  v_sharer_share_final_cents := v_sharer_product_share_cents + v_sharer_pickup_share_cents;

  v_sharer_discount_cents := least(v_sharer_share_final_cents, v_sharer_products_value_cents);
  v_discount_remaining_cents := v_sharer_discount_cents;

  if v_sharer_discount_cents > 0 and v_sharer_products_value_cents > 0 then
    for v_bucket in
      with vat_buckets as (
        select
          coalesce(p.vat_rate, 0)::numeric as vat_rate,
          coalesce(sum(oi.line_total_cents), 0)::int as bucket_ttc_cents
        from public.order_items oi
        left join public.products p on p.id = oi.product_id
        where oi.order_id = p_order_id
          and oi.participant_id = v_sharer_participant_id
        group by 1
        having coalesce(sum(oi.line_total_cents), 0) > 0
      )
      select
        vat_rate,
        bucket_ttc_cents,
        row_number() over (order by vat_rate) as rn,
        count(*) over () as cnt
      from vat_buckets
      order by vat_rate
    loop
      exit when v_discount_remaining_cents <= 0;

      if v_bucket.rn = v_bucket.cnt then
        v_bucket_discount_cents := least(v_discount_remaining_cents, v_bucket.bucket_ttc_cents);
      else
        v_bucket_discount_cents := round(
          (v_sharer_discount_cents::numeric * v_bucket.bucket_ttc_cents::numeric)
          / nullif(v_sharer_products_value_cents::numeric, 0)
        )::int;
        v_bucket_discount_cents := greatest(0, least(v_bucket_discount_cents, v_bucket.bucket_ttc_cents));
        v_bucket_discount_cents := least(v_bucket_discount_cents, v_discount_remaining_cents);
      end if;

      if v_bucket_discount_cents <= 0 then
        continue;
      end if;

      v_bucket_ht_cents := public.calc_ht_cents_from_ttc(v_bucket_discount_cents, v_bucket.vat_rate);
      v_bucket_tva_cents := public.calc_tva_cents_from_ttc(v_bucket_discount_cents, v_bucket.vat_rate);

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
        v_invoice_id,
        'Remise produits du partageur',
        1,
        -v_bucket_discount_cents,
        -v_bucket_discount_cents,
        v_bucket.vat_rate,
        -v_bucket_ht_cents,
        -v_bucket_tva_cents,
        jsonb_build_object(
          'component', 'sharer_discount',
          'sharer_product_share_cents', v_sharer_product_share_cents,
          'sharer_pickup_share_cents', v_sharer_pickup_share_cents
        )
      );

      v_discount_remaining_cents := v_discount_remaining_cents - v_bucket_discount_cents;
    end loop;
  end if;

  select
    coalesce(sum(fl.total_ttc_cents), 0)::int,
    coalesce(sum(fl.total_ht_cents), 0)::int,
    coalesce(sum(fl.total_tva_cents), 0)::int
    into v_total_ttc_cents, v_total_ht_cents, v_total_tva_cents
  from public.facture_lignes fl
  where fl.facture_id = v_invoice_id;

  update public.factures
  set
    currency = v_order.currency,
    total_ttc_cents = v_total_ttc_cents,
    total_ht_cents = v_total_ht_cents,
    total_tva_cents = v_total_tva_cents,
    issued_at = coalesce(issued_at, now()),
    status = 'issued',
    updated_at = now()
  where id = v_invoice_id;

  insert into public.emails_sortants (kind, status, to_profile_id, facture_id, payload)
  values ('FACTURE_CLIENT', 'pending', v_order.sharer_profile_id, v_invoice_id, '{}'::jsonb)
  on conflict do nothing;

  return v_invoice_id;
end;
$function$;

create or replace function public.create_auto_invoice_for_pro_sharer(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_sharer_profile_id uuid;
  v_account_type text;
  v_platform_profile_id uuid := 'd1d67cf6-0d41-4a05-95a0-335c15b15a05';
  v_invoice_id uuid;
  v_numero text;
  v_sharer_share_cents int := 0;
  v_vat_regime text;
  v_vat_rate numeric := 0;
  v_total_ttc int := 0;
  v_total_ht int := 0;
  v_total_tva int := 0;
  v_mention_tva text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  v_sharer_profile_id := v_order.sharer_profile_id;

  select account_type into v_account_type
  from public.profiles
  where id = v_sharer_profile_id;

  if v_account_type not in ('company','association','public_institution') then
    return null;
  end if;

  select public.compute_order_sharer_product_share_cents(v_order.id)
    into v_sharer_share_cents;

  if v_sharer_share_cents = 0 then
    return null;
  end if;

  select le.vat_regime into v_vat_regime
  from public.legal_entities le
  where le.profile_id = v_sharer_profile_id;

  if v_vat_regime is null then
    v_vat_regime := 'unknown';
  end if;

  if v_vat_regime = 'assujetti' then
    v_vat_rate := 0.20;
  else
    v_vat_rate := 0;
  end if;

  v_total_ttc := v_sharer_share_cents;
  if v_vat_rate > 0 then
    v_total_ht := public.calc_ht_cents_from_ttc(v_total_ttc, v_vat_rate);
    v_total_tva := public.calc_tva_cents_from_ttc(v_total_ttc, v_vat_rate);
  else
    v_total_ht := v_total_ttc;
    v_total_tva := 0;
  end if;

  if v_vat_regime = 'franchise' then
    v_mention_tva := 'TVA non applicable, art. 293 B du CGI';
  else
    v_mention_tva := null;
  end if;

  select id into v_invoice_id
  from public.factures
  where order_id = v_order.id
    and serie = 'PLAT_SHARER'
    and client_profile_id = v_platform_profile_id
    and producer_profile_id = v_sharer_profile_id
  limit 1;

  if v_invoice_id is null then
    v_numero := public.next_facture_numero_producteur(v_sharer_profile_id, 'PLAT_SHARER', current_date);
    insert into public.factures (
      serie, producer_profile_id, order_id, payment_id, client_profile_id,
      numero, issued_at, currency,
      total_ttc_cents, total_ht_cents, total_tva_cents, mention_tva,
      seller_snapshot, buyer_snapshot, status
    ) values (
      'PLAT_SHARER',
      v_sharer_profile_id,
      v_order.id,
      null,
      v_platform_profile_id,
      v_numero,
      now(),
      v_order.currency,
      v_total_ttc,
      v_total_ht,
      v_total_tva,
      v_mention_tva,
      '{}'::jsonb,
      '{}'::jsonb,
      'issued'
    ) returning id into v_invoice_id;

    insert into public.facture_lignes (
      facture_id, label, quantity, unit_ttc_cents, total_ttc_cents,
      vat_rate, total_ht_cents, total_tva_cents, metadata
    ) values (
      v_invoice_id,
      'Part partageur',
      1,
      v_total_ttc,
      v_total_ttc,
      v_vat_rate,
      v_total_ht,
      v_total_tva,
      jsonb_build_object(
        'component', 'sharer_product_share',
        'pickup_share_excluded', true
      )
    );
  end if;

  insert into public.emails_sortants (kind, status, to_profile_id, facture_id, payload)
  values ('FACTURE_AUTO_SHARER', 'pending', v_sharer_profile_id, v_invoice_id, '{}'::jsonb)
  on conflict do nothing;

  return v_invoice_id;
end;
$function$;
