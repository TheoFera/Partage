begin;
select set_config('request.jwt.claims', '{"role":"service_role","sub":"00000000-0000-0000-0000-000000000000"}', true);

select public.recompute_lot_price(id) from public.lots;

with b as (
  select
    l.id as lot_id,
    l.lot_code,
    l.status,
    l.price_cents,
    coalesce(sum(case when b.source='producer' then b.value_cents else 0 end),0)::int as producer_sum_cents,
    coalesce(sum(case when b.source='platform' then b.value_cents else 0 end),0)::int as platform_sum_cents,
    count(*) filter (where b.source='producer')::int as producer_rows,
    count(*) filter (where b.source='platform')::int as platform_rows,
    count(*) filter (where b.source='platform' and coalesce(lower(b.value_type::text),'') <> 'cents')::int as platform_non_cents_rows
  from public.lots l
  left join public.lot_price_breakdown b on b.lot_id=l.id
  group by l.id, l.lot_code, l.status, l.price_cents
)
select * from b order by lot_code;

with b as (
  select
    l.id as lot_id,
    count(*) filter (where b.source='producer')::int as producer_rows,
    count(*) filter (where b.source='platform')::int as platform_rows,
    count(*) filter (where b.source='platform' and coalesce(lower(b.value_type::text),'') <> 'cents')::int as platform_non_cents_rows
  from public.lots l
  left join public.lot_price_breakdown b on b.lot_id=l.id
  group by l.id
)
select
  count(*) filter (where producer_rows>0 and platform_rows=0) as lots_with_producer_but_no_platform_after_recompute,
  count(*) filter (where platform_non_cents_rows>0) as lots_with_non_cents_platform_rows_after_recompute
from b;

rollback;
