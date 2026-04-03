create or replace function public.can_manage_product(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.products p
      where p.id = p_product_id
        and p.producer_profile_id = auth.uid()
    );
$$;

create or replace function public.can_manage_lot(p_lot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.lots l
      join public.products p on p.id = l.product_id
      where l.id = p_lot_id
        and p.producer_profile_id = auth.uid()
    );
$$;

grant execute on function public.can_manage_product(uuid) to authenticated;
grant execute on function public.can_manage_lot(uuid) to authenticated;

alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_ingredients enable row level security;
alter table public.product_journey_steps enable row level security;
alter table public.lots enable row level security;
alter table public.lot_labels enable row level security;
alter table public.lot_inputs enable row level security;
alter table public.lot_trace_steps enable row level security;
alter table public.lot_price_breakdown enable row level security;

drop policy if exists products_insert on public.products;
drop policy if exists products_update on public.products;
drop policy if exists products_delete on public.products;

create policy products_insert_owner
  on public.products
  for insert
  to authenticated
  with check (producer_profile_id = auth.uid());

create policy products_update_owner
  on public.products
  for update
  to authenticated
  using (producer_profile_id = auth.uid())
  with check (producer_profile_id = auth.uid());

create policy products_delete_owner
  on public.products
  for delete
  to authenticated
  using (producer_profile_id = auth.uid());

drop policy if exists product_images_insert on public.product_images;
drop policy if exists product_images_update on public.product_images;
drop policy if exists product_images_delete on public.product_images;

create policy product_images_insert_owner
  on public.product_images
  for insert
  to authenticated
  with check (public.can_manage_product(product_id));

create policy product_images_update_owner
  on public.product_images
  for update
  to authenticated
  using (public.can_manage_product(product_id))
  with check (public.can_manage_product(product_id));

create policy product_images_delete_owner
  on public.product_images
  for delete
  to authenticated
  using (public.can_manage_product(product_id));

drop policy if exists product_ingredients_insert on public.product_ingredients;
drop policy if exists product_ingredients_update on public.product_ingredients;
drop policy if exists product_ingredients_delete on public.product_ingredients;

create policy product_ingredients_insert_owner
  on public.product_ingredients
  for insert
  to authenticated
  with check (public.can_manage_product(product_id));

create policy product_ingredients_update_owner
  on public.product_ingredients
  for update
  to authenticated
  using (public.can_manage_product(product_id))
  with check (public.can_manage_product(product_id));

create policy product_ingredients_delete_owner
  on public.product_ingredients
  for delete
  to authenticated
  using (public.can_manage_product(product_id));

drop policy if exists product_journey_steps_insert on public.product_journey_steps;
drop policy if exists product_journey_steps_update on public.product_journey_steps;
drop policy if exists product_journey_steps_delete on public.product_journey_steps;

create policy product_journey_steps_insert_owner
  on public.product_journey_steps
  for insert
  to authenticated
  with check (public.can_manage_product(product_id));

create policy product_journey_steps_update_owner
  on public.product_journey_steps
  for update
  to authenticated
  using (public.can_manage_product(product_id))
  with check (public.can_manage_product(product_id));

create policy product_journey_steps_delete_owner
  on public.product_journey_steps
  for delete
  to authenticated
  using (public.can_manage_product(product_id));

drop policy if exists lots_insert on public.lots;
drop policy if exists lots_update on public.lots;
drop policy if exists lots_delete on public.lots;

create policy lots_insert_owner
  on public.lots
  for insert
  to authenticated
  with check (public.can_manage_product(product_id));

create policy lots_update_owner
  on public.lots
  for update
  to authenticated
  using (public.can_manage_product(product_id))
  with check (public.can_manage_product(product_id));

create policy lots_delete_owner
  on public.lots
  for delete
  to authenticated
  using (public.can_manage_product(product_id));

drop policy if exists lot_labels_insert on public.lot_labels;
drop policy if exists lot_labels_update on public.lot_labels;
drop policy if exists lot_labels_delete on public.lot_labels;

create policy lot_labels_insert_owner
  on public.lot_labels
  for insert
  to authenticated
  with check (public.can_manage_lot(lot_id));

create policy lot_labels_update_owner
  on public.lot_labels
  for update
  to authenticated
  using (public.can_manage_lot(lot_id))
  with check (public.can_manage_lot(lot_id));

create policy lot_labels_delete_owner
  on public.lot_labels
  for delete
  to authenticated
  using (public.can_manage_lot(lot_id));

drop policy if exists lot_inputs_insert on public.lot_inputs;
drop policy if exists lot_inputs_update on public.lot_inputs;
drop policy if exists lot_inputs_delete on public.lot_inputs;

create policy lot_inputs_insert_owner
  on public.lot_inputs
  for insert
  to authenticated
  with check (public.can_manage_lot(lot_id));

create policy lot_inputs_update_owner
  on public.lot_inputs
  for update
  to authenticated
  using (public.can_manage_lot(lot_id))
  with check (public.can_manage_lot(lot_id));

create policy lot_inputs_delete_owner
  on public.lot_inputs
  for delete
  to authenticated
  using (public.can_manage_lot(lot_id));

drop policy if exists lot_trace_steps_insert on public.lot_trace_steps;
drop policy if exists lot_trace_steps_update on public.lot_trace_steps;
drop policy if exists lot_trace_steps_delete on public.lot_trace_steps;

create policy lot_trace_steps_insert_owner
  on public.lot_trace_steps
  for insert
  to authenticated
  with check (public.can_manage_lot(lot_id));

create policy lot_trace_steps_update_owner
  on public.lot_trace_steps
  for update
  to authenticated
  using (public.can_manage_lot(lot_id))
  with check (public.can_manage_lot(lot_id));

create policy lot_trace_steps_delete_owner
  on public.lot_trace_steps
  for delete
  to authenticated
  using (public.can_manage_lot(lot_id));

drop policy if exists lot_price_breakdown_insert on public.lot_price_breakdown;
drop policy if exists lot_price_breakdown_update on public.lot_price_breakdown;
drop policy if exists lot_price_breakdown_delete on public.lot_price_breakdown;
drop policy if exists "producer inserts own breakdown" on public.lot_price_breakdown;
drop policy if exists "producer updates own breakdown" on public.lot_price_breakdown;
drop policy if exists "producer deletes own breakdown" on public.lot_price_breakdown;

create policy lot_price_breakdown_insert_owner
  on public.lot_price_breakdown
  for insert
  to authenticated
  with check (public.can_manage_lot(lot_id) and source = 'producer');

create policy lot_price_breakdown_update_owner
  on public.lot_price_breakdown
  for update
  to authenticated
  using (public.can_manage_lot(lot_id) and source = 'producer')
  with check (public.can_manage_lot(lot_id) and source = 'producer');

create policy lot_price_breakdown_delete_owner
  on public.lot_price_breakdown
  for delete
  to authenticated
  using (public.can_manage_lot(lot_id));
