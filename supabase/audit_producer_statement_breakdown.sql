-- Audit detaille d'un releve de reglement producteur
-- Usage:
-- 1) Remplacer l'UUID dans tmp_audit_order_params
-- 2) Executer tout le script dans le SQL editor
-- 3) Lire successivement:
--    - tmp_audit_statement_summary
--    - tmp_audit_statement_lines
--    - tmp_audit_item_audit
--
-- Ce script permet de voir:
-- - l'origine exacte de chaque ligne du releve
-- - la decomposition produit / partageur / recuperation
-- - les arrondis unitaire livraison / partageur
-- - l'effet d'un calcul "au seuil minimal" vs "au poids effectif reel"
-- - le delta signe entre livraison repartie dans les lignes et livraison du beneficiaire reel

create or replace temp view tmp_audit_order_params as
select '929a0856-a115-4ac5-bf86-dd6ffe7f75ea'::uuid as order_id;

create or replace temp view tmp_audit_order_ctx as
select
  o.id as order_id,
  o.status,
  o.delivery_option,
  o.sharer_profile_id,
  o.producer_profile_id,
  coalesce(o.min_weight_kg, 0)::numeric as min_weight_kg,
  coalesce(o.max_weight_kg, 0)::numeric as max_weight_kg,
  coalesce(o.ordered_weight_kg, 0)::numeric as ordered_weight_kg,
  coalesce(o.effective_weight_kg, 0)::numeric as effective_weight_kg,
  coalesce(o.delivery_fee_cents, 0)::int as delivery_fee_cents,
  coalesce(o.pickup_delivery_fee_cents, 0)::int as pickup_delivery_fee_cents,
  coalesce(o.sharer_percentage, 0)::numeric as sharer_percentage,
  case
    when coalesce(o.sharer_percentage, 0) > 0 and o.sharer_percentage < 100
      then o.sharer_percentage / (100 - o.sharer_percentage)
    else 0
  end as share_fraction
from public.orders o
join tmp_audit_order_params p on p.order_id = o.id;

create or replace temp view tmp_audit_order_math as
with base as (
  select
    ctx.*,
    case
      when ctx.delivery_option = 'producer_pickup' then ctx.pickup_delivery_fee_cents::numeric
      when ctx.delivery_option = 'producer_delivery' then ctx.delivery_fee_cents::numeric
      else case
        when ctx.effective_weight_kg > 0
          then greatest(15, 5 * round((7 + 8 * sqrt(ctx.effective_weight_kg)) / 5))::numeric
        else 0::numeric
      end
    end as current_delivery_fee_total_cents,
    case
      when ctx.min_weight_kg > 0 then ctx.min_weight_kg
      else null::numeric
    end as threshold_weight_kg,
    case
      when ctx.min_weight_kg > 0 and ctx.delivery_option = 'producer_pickup'
        then ctx.pickup_delivery_fee_cents::numeric
      when ctx.min_weight_kg > 0 and ctx.delivery_option = 'producer_delivery'
        then ctx.delivery_fee_cents::numeric
      when ctx.min_weight_kg > 0
        then greatest(15, 5 * round((7 + 8 * sqrt(ctx.min_weight_kg)) / 5))::numeric
      else null::numeric
    end as threshold_delivery_fee_total_cents
  from tmp_audit_order_ctx ctx
)
select
  base.*,
  case
    when base.effective_weight_kg > 0 then base.current_delivery_fee_total_cents / base.effective_weight_kg
    else 0::numeric
  end as current_fee_per_kg_cents,
  case
    when base.threshold_weight_kg > 0 then base.threshold_delivery_fee_total_cents / base.threshold_weight_kg
    else null::numeric
  end as threshold_fee_per_kg_cents,
  case
    when base.delivery_option = 'producer_pickup' then base.pickup_delivery_fee_cents
    when base.delivery_option in ('producer_delivery', 'chronofresh') then base.delivery_fee_cents
    else 0
  end as delivery_beneficiary_cents
from base;

create or replace temp view tmp_audit_item_rows as
select
  oi.id as order_item_id,
  op.role as participant_role,
  op.profile_id as participant_profile_id,
  coalesce(pr.name, oi.product_id::text) as product_name,
  oi.product_id,
  oi.quantity_units,
  coalesce(oi.unit_weight_kg, 0)::numeric as unit_weight_kg,
  oi.unit_base_price_cents,
  oi.unit_delivery_cents,
  oi.unit_sharer_fee_cents,
  oi.unit_final_price_cents,
  oi.line_total_cents
from public.order_items oi
join tmp_audit_order_math om on om.order_id = oi.order_id
join public.order_participants op on op.id = oi.participant_id
left join public.products pr on pr.id = oi.product_id;

create or replace temp view tmp_audit_item_audit as
select
  ir.order_item_id,
  ir.participant_role,
  case
    when ir.participant_role = 'sharer' then 'repriced_at_close'
    else 'frozen_at_purchase'
  end as pricing_regime,
  ir.product_name,
  ir.product_id,
  ir.quantity_units,
  ir.unit_weight_kg,
  ir.unit_base_price_cents,
  ir.unit_delivery_cents as stored_unit_delivery_cents,
  round(om.current_fee_per_kg_cents * ir.unit_weight_kg, 6) as current_unit_delivery_raw_cents,
  round(om.current_fee_per_kg_cents * ir.unit_weight_kg)::int as current_unit_delivery_rounded_cents,
  ir.unit_delivery_cents - round(om.current_fee_per_kg_cents * ir.unit_weight_kg)::int as stored_vs_current_delivery_delta_cents,
  case
    when om.threshold_fee_per_kg_cents is not null
      then round(om.threshold_fee_per_kg_cents * ir.unit_weight_kg, 6)
    else null::numeric
  end as threshold_unit_delivery_raw_cents,
  case
    when om.threshold_fee_per_kg_cents is not null
      then round(om.threshold_fee_per_kg_cents * ir.unit_weight_kg)::int
    else null::int
  end as threshold_unit_delivery_rounded_cents,
  ir.unit_sharer_fee_cents as stored_unit_sharer_fee_cents,
  round((ir.unit_base_price_cents + ir.unit_delivery_cents)::numeric * om.share_fraction, 6) as raw_unit_sharer_fee_from_stored_delivery_cents,
  round((ir.unit_base_price_cents + ir.unit_delivery_cents)::numeric * om.share_fraction)::int as rounded_unit_sharer_fee_from_stored_delivery_cents,
  ir.unit_sharer_fee_cents - round((ir.unit_base_price_cents + ir.unit_delivery_cents)::numeric * om.share_fraction)::int as stored_share_rounding_gap_cents,
  round(
    (
      ir.unit_base_price_cents
      + round(om.current_fee_per_kg_cents * ir.unit_weight_kg)::int
    )::numeric * om.share_fraction,
    6
  ) as current_unit_sharer_fee_raw_cents,
  round(
    (
      ir.unit_base_price_cents
      + round(om.current_fee_per_kg_cents * ir.unit_weight_kg)::int
    )::numeric * om.share_fraction
  )::int as current_unit_sharer_fee_rounded_cents,
  ir.unit_sharer_fee_cents - round(
    (
      ir.unit_base_price_cents
      + round(om.current_fee_per_kg_cents * ir.unit_weight_kg)::int
    )::numeric * om.share_fraction
  )::int as stored_vs_current_sharer_delta_cents,
  case
    when om.threshold_fee_per_kg_cents is not null then round(
      (
        ir.unit_base_price_cents
        + round(om.threshold_fee_per_kg_cents * ir.unit_weight_kg)::int
      )::numeric * om.share_fraction,
      6
    )
    else null::numeric
  end as threshold_unit_sharer_fee_raw_cents,
  case
    when om.threshold_fee_per_kg_cents is not null then round(
      (
        ir.unit_base_price_cents
        + round(om.threshold_fee_per_kg_cents * ir.unit_weight_kg)::int
      )::numeric * om.share_fraction
    )::int
    else null::int
  end as threshold_unit_sharer_fee_rounded_cents,
  ir.unit_final_price_cents as stored_unit_final_price_cents,
  ir.unit_base_price_cents + ir.unit_delivery_cents + ir.unit_sharer_fee_cents as recomposed_from_stored_parts_cents,
  ir.unit_base_price_cents
    + round(om.current_fee_per_kg_cents * ir.unit_weight_kg)::int
    + round(
      (
        ir.unit_base_price_cents
        + round(om.current_fee_per_kg_cents * ir.unit_weight_kg)::int
      )::numeric * om.share_fraction
    )::int as current_unit_final_rounded_cents,
  case
    when om.threshold_fee_per_kg_cents is not null then
      ir.unit_base_price_cents
      + round(om.threshold_fee_per_kg_cents * ir.unit_weight_kg)::int
      + round(
        (
          ir.unit_base_price_cents
          + round(om.threshold_fee_per_kg_cents * ir.unit_weight_kg)::int
        )::numeric * om.share_fraction
      )::int
    else null::int
  end as threshold_unit_final_rounded_cents,
  ir.quantity_units * ir.unit_base_price_cents as line_base_total_cents,
  ir.quantity_units * ir.unit_delivery_cents as line_delivery_total_cents,
  ir.quantity_units * ir.unit_sharer_fee_cents as line_sharer_fee_total_cents,
  ir.quantity_units * ir.unit_final_price_cents as line_final_total_cents,
  ir.quantity_units * round(
    (
      ir.unit_base_price_cents
      + round(om.current_fee_per_kg_cents * ir.unit_weight_kg)::int
    )::numeric * om.share_fraction
  )::int as current_line_sharer_fee_total_cents,
  case
    when om.threshold_fee_per_kg_cents is not null then
      ir.quantity_units * round(
        (
          ir.unit_base_price_cents
          + round(om.threshold_fee_per_kg_cents * ir.unit_weight_kg)::int
        )::numeric * om.share_fraction
      )::int
    else null::int
  end as threshold_line_sharer_fee_total_cents
from tmp_audit_item_rows ir
cross join tmp_audit_order_math om;

create or replace temp view tmp_audit_statement_summary as
with item_totals as (
  select
    coalesce(sum(line_final_total_cents), 0)::int as total_ordered_cents,
    coalesce(sum(line_base_total_cents), 0)::int as producer_base_total_cents,
    coalesce(sum(line_delivery_total_cents), 0)::int as delivery_total_cents_from_items,
    coalesce(sum(line_sharer_fee_total_cents), 0)::int as actual_sharer_product_share_cents,
    coalesce(sum(current_line_sharer_fee_total_cents), 0)::int as current_repriced_sharer_product_share_cents,
    coalesce(sum(threshold_line_sharer_fee_total_cents), 0)::int as threshold_repriced_sharer_product_share_cents
  from tmp_audit_item_audit
),
platform_invoice as (
  select
    coalesce(sum(fl.total_ttc_cents), 0)::int as platform_commission_cents,
    coalesce(max((fl.metadata->>'payment_fees_ttc_cents')::int), 0)::int as payment_fees_ttc_cents,
    coalesce(max((fl.metadata->>'delivery_fee_to_platform_cents')::int), 0)::int as delivery_fee_to_platform_cents
  from public.factures f
  join public.facture_lignes fl on fl.facture_id = f.id
  join tmp_audit_order_math om on om.order_id = f.order_id
  where f.serie = 'PLAT_PROD'
    and coalesce(fl.metadata->>'component', '') = 'platform_commission'
),
sharer_invoice as (
  select
    coalesce(sum(greatest(-fl.total_ttc_cents, 0)), 0)::int as sharer_discount_cents
  from public.factures f
  join public.facture_lignes fl on fl.facture_id = f.id
  join tmp_audit_order_math om on om.order_id = f.order_id
  where f.serie = 'PROD_CLIENT'
    and coalesce(fl.metadata->>'component', '') = 'sharer_discount'
),
coop_rows as (
  select cl.id, cl.reason, coalesce(cl.delta_cents, 0) as delta_cents, cl.created_at
  from public.coop_ledger cl
  join tmp_audit_order_math om on om.order_id = cl.order_id
  where cl.order_id = om.order_id
    and cl.profile_id = om.sharer_profile_id
    and cl.reason in ('create_surplus', 'sharer_surplus')
),
selected_coop_surplus as (
  select cr.*
  from coop_rows cr
  where cr.reason = case
    when exists (select 1 from coop_rows where reason = 'create_surplus')
      then 'create_surplus'
    else 'sharer_surplus'
  end
),
coop_summary as (
  select
    case when count(*) > 0 then sum(greatest(delta_cents, 0))::int else 0 end as coop_surplus_cents,
    case when count(*) > 0 then (array_agg(id order by created_at desc))[1] else null::uuid end as coop_surplus_ledger_id
  from selected_coop_surplus
),
participant_gains as (
  select
    coalesce(sum(greatest(coalesce(cl.delta_cents, 0), 0)), 0)::int as participant_gains_cents,
    coalesce(array_agg(cl.id::text order by cl.created_at desc), '{}'::text[]) as participant_gains_ledger_refs
  from public.coop_ledger cl
  join tmp_audit_order_math om on om.order_id = cl.order_id
  where cl.order_id = om.order_id
    and cl.reason = 'participant_gain'
    and cl.profile_id <> om.sharer_profile_id
),
participant_coop_used as (
  select
    coalesce(sum(greatest(-coalesce(cl.delta_cents, 0), 0)), 0)::int as participant_coop_used_cents
  from public.coop_ledger cl
  join tmp_audit_order_math om on om.order_id = cl.order_id
  where cl.order_id = om.order_id
    and cl.reason = 'consume_order'
    and cl.profile_id <> om.sharer_profile_id
)
select
  om.order_id,
  om.status,
  om.delivery_option,
  om.min_weight_kg,
  om.ordered_weight_kg,
  om.effective_weight_kg,
  om.sharer_percentage,
  om.share_fraction,
  om.current_delivery_fee_total_cents::int as current_delivery_fee_total_cents,
  round(om.current_fee_per_kg_cents, 6) as current_fee_per_kg_cents,
  om.delivery_beneficiary_cents::int as delivery_beneficiary_cents,
  om.threshold_weight_kg,
  om.threshold_delivery_fee_total_cents::int as threshold_delivery_fee_total_cents,
  round(om.threshold_fee_per_kg_cents, 6) as threshold_fee_per_kg_cents,
  it.total_ordered_cents,
  it.producer_base_total_cents,
  it.delivery_total_cents_from_items,
  it.actual_sharer_product_share_cents,
  it.current_repriced_sharer_product_share_cents,
  it.threshold_repriced_sharer_product_share_cents,
  case when om.delivery_option = 'producer_pickup' then om.pickup_delivery_fee_cents else 0 end as pickup_share_cents,
  (it.delivery_total_cents_from_items - om.delivery_beneficiary_cents)::int as delivery_rounding_delta_cents,
  pi.platform_commission_cents,
  (pi.platform_commission_cents + (it.delivery_total_cents_from_items - om.delivery_beneficiary_cents))::int
    as platform_commission_with_delivery_rounding_cents,
  pi.payment_fees_ttc_cents,
  pi.delivery_fee_to_platform_cents,
  si.sharer_discount_cents,
  cs.coop_surplus_cents,
  pg.participant_gains_cents,
  pcu.participant_coop_used_cents,
  greatest(
    0,
    it.total_ordered_cents
    - pi.platform_commission_cents
    - si.sharer_discount_cents
    - cs.coop_surplus_cents
    - pg.participant_gains_cents
  )::int as transfer_to_producer_cents,
  (
    it.total_ordered_cents
    - pi.platform_commission_cents
    - pg.participant_gains_cents
    - case when om.delivery_option = 'producer_pickup' then om.pickup_delivery_fee_cents else 0 end
    - it.producer_base_total_cents
  )::int as required_sharer_product_share_for_exact_base_cents,
  (
    it.actual_sharer_product_share_cents
    - (
      it.total_ordered_cents
      - pi.platform_commission_cents
      - pg.participant_gains_cents
      - case when om.delivery_option = 'producer_pickup' then om.pickup_delivery_fee_cents else 0 end
      - it.producer_base_total_cents
    )
  )::int as actual_minus_required_sharer_product_share_delta_cents,
  (
    greatest(
      0,
      it.total_ordered_cents
      - pi.platform_commission_cents
      - si.sharer_discount_cents
      - cs.coop_surplus_cents
      - pg.participant_gains_cents
    ) - it.producer_base_total_cents
  )::int as transfer_minus_producer_base_delta_cents,
  cs.coop_surplus_ledger_id,
  pg.participant_gains_ledger_refs
from tmp_audit_order_math om
cross join item_totals it
cross join platform_invoice pi
cross join sharer_invoice si
cross join coop_summary cs
cross join participant_gains pg
cross join participant_coop_used pcu;

create or replace temp view tmp_audit_statement_lines as
select
  10 as sort_order,
  'Total commande'::text as statement_line,
  s.total_ordered_cents as amount_cents,
  'sum(order_items.line_total_cents)'::text as formula,
  'order_items'::text as source
from tmp_audit_statement_summary s
union all
select
  20,
  'Commission plateforme',
  s.platform_commission_cents,
  'sum(facture_lignes total_ttc_cents composant platform_commission)',
  'factures PLAT_PROD / facture_lignes'
from tmp_audit_statement_summary s
union all
select
  21,
  'dont frais de paiement',
  s.payment_fees_ttc_cents,
  'metadata payment_fees_ttc_cents sur la ligne de commission plateforme',
  'facture_lignes.metadata'
from tmp_audit_statement_summary s
union all
select
  22,
  'Delta d''arrondi livraison',
  s.delivery_rounding_delta_cents,
  'sum(order_items.quantity_units * unit_delivery_cents) - delivery_beneficiary_cents',
  'order_items vs orders'
from tmp_audit_statement_summary s
union all
select
  23,
  'Commission plateforme si la plateforme absorbe le delta livraison',
  s.platform_commission_with_delivery_rounding_cents,
  'commission plateforme actuelle + delta d''arrondi livraison',
  'projection'
from tmp_audit_statement_summary s
union all
select
  30,
  'Part partageur produits exacte',
  s.actual_sharer_product_share_cents,
  'sum(order_items.quantity_units * order_items.unit_sharer_fee_cents)',
  'order_items'
from tmp_audit_statement_summary s
union all
select
  31,
  'Recuperation producer_pickup',
  s.pickup_share_cents,
  'pickup_delivery_fee_cents si delivery_option = producer_pickup',
  'orders'
from tmp_audit_statement_summary s
union all
select
  40,
  'Remise sur les produits du partageur',
  s.sharer_discount_cents,
  'sum des lignes negatives sharer_discount de la facture PROD_CLIENT',
  'factures PROD_CLIENT / facture_lignes'
from tmp_audit_statement_summary s
union all
select
  50,
  'Affectation gains de cooperation partageur',
  s.coop_surplus_cents,
  'coop_ledger reason create_surplus ou sharer_surplus',
  'coop_ledger'
from tmp_audit_statement_summary s
union all
select
  60,
  'Affectation gains de cooperation participants',
  s.participant_gains_cents,
  'sum coop_ledger reason participant_gain hors partageur',
  'coop_ledger'
from tmp_audit_statement_summary s
union all
select
  70,
  'Virement au producteur',
  s.transfer_to_producer_cents,
  'Total commande - commission plateforme - remise partageur - surplus partageur - gains participants',
  'releve producteur'
from tmp_audit_statement_summary s
union all
select
  80,
  'Base producteur theorique',
  s.producer_base_total_cents,
  'sum(order_items.quantity_units * order_items.unit_base_price_cents)',
  'order_items'
from tmp_audit_statement_summary s
union all
select
  90,
  'Part partageur produits requise pour retomber exactement sur la base producteur',
  s.required_sharer_product_share_for_exact_base_cents,
  'Total commande - commission plateforme - pickup - gains participants - base producteur',
  'reconstruction theorique'
from tmp_audit_statement_summary s
union all
select
  100,
  'Ecart actuel sur la part partageur produits',
  s.actual_minus_required_sharer_product_share_delta_cents,
  'Part partageur produits exacte - part partageur produits requise',
  'comparaison'
from tmp_audit_statement_summary s
union all
select
  110,
  'Ecart final virement producteur vs base producteur',
  s.transfer_minus_producer_base_delta_cents,
  'Virement producteur - base producteur theorique',
  'comparaison'
from tmp_audit_statement_summary s;

select * from tmp_audit_statement_summary;

select *
from tmp_audit_statement_lines
order by sort_order;

select
  order_item_id,
  participant_role,
  pricing_regime,
  product_name,
  quantity_units,
  unit_weight_kg,
  unit_base_price_cents,
  stored_unit_delivery_cents,
  current_unit_delivery_raw_cents,
  current_unit_delivery_rounded_cents,
  stored_vs_current_delivery_delta_cents,
  threshold_unit_delivery_raw_cents,
  threshold_unit_delivery_rounded_cents,
  stored_unit_sharer_fee_cents,
  raw_unit_sharer_fee_from_stored_delivery_cents,
  rounded_unit_sharer_fee_from_stored_delivery_cents,
  stored_share_rounding_gap_cents,
  current_unit_sharer_fee_raw_cents,
  current_unit_sharer_fee_rounded_cents,
  stored_vs_current_sharer_delta_cents,
  threshold_unit_sharer_fee_raw_cents,
  threshold_unit_sharer_fee_rounded_cents,
  stored_unit_final_price_cents,
  current_unit_final_rounded_cents,
  threshold_unit_final_rounded_cents,
  line_base_total_cents,
  line_delivery_total_cents,
  line_sharer_fee_total_cents,
  current_line_sharer_fee_total_cents,
  threshold_line_sharer_fee_total_cents,
  line_final_total_cents
from tmp_audit_item_audit
order by participant_role, product_name, order_item_id;
