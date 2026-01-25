-- Notifications schema + triggers for orders
-- Execute in Supabase SQL editor or include in migrations.

create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid null references public.orders(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null,
  event_key text not null,
  data jsonb null,
  created_at timestamptz not null default now(),
  read_at timestamptz null
);

create unique index if not exists notifications_profile_event_key_unique
  on public.notifications(profile_id, event_key);

create index if not exists notifications_profile_created_at_idx
  on public.notifications(profile_id, created_at desc);

alter table public.notifications enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_select_own'
  ) then
    create policy notifications_select_own
      on public.notifications
      for select
      using (auth.uid() = profile_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_update_own'
  ) then
    create policy notifications_update_own
      on public.notifications
      for update
      using (auth.uid() = profile_id)
      with check (auth.uid() = profile_id);
  end if;
end $$;

create or replace function public.create_notification(
  p_profile_id uuid,
  p_title text,
  p_message text,
  p_type text,
  p_event_key text,
  p_order_id uuid default null,
  p_data jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile_id is null then
    return;
  end if;

  insert into public.notifications (
    profile_id,
    order_id,
    title,
    message,
    notification_type,
    event_key,
    data
  )
  values (
    p_profile_id,
    p_order_id,
    p_title,
    p_message,
    p_type,
    p_event_key,
    p_data
  )
  on conflict (profile_id, event_key) do nothing;
end;
$$;

create or replace function public.order_products_summary(p_order_id uuid)
returns text
language sql
stable
as $$
  select string_agg(p.name, ', ' order by op.sort_order nulls last)
  from public.order_products op
  join public.products p on p.id = op.product_id
  where op.order_id = p_order_id
    and op.is_enabled = true
$$;

create or replace function public.notify_order_created_from_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_products text;
  v_products_suffix text;
begin
  for v_order in
    select distinct o.*
    from public.orders o
    join new_rows n on n.order_id = o.id
  loop
    if v_order.status <> 'open' then
      continue;
    end if;

    v_products := public.order_products_summary(v_order.id);
    v_products_suffix := case
      when v_products is null or v_products = '' then ''
      else ' Produits : ' || v_products
    end;

    perform public.create_notification(
      v_order.producer_profile_id,
      'Nouvelle commande ouverte',
      'Commande "' || v_order.title || '" ouverte.' || v_products_suffix,
      'order_created_producer',
      'order_created_producer:' || v_order.id,
      v_order.id,
      jsonb_build_object('products', v_products)
    );
  end loop;

  return null;
end;
$$;

drop trigger if exists order_products_notify_created on public.order_products;
create trigger order_products_notify_created
  after insert on public.order_products
  referencing new table as new_rows
  for each statement
  execute function public.notify_order_created_from_products();

create or replace function public.notify_order_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_products text;
  v_products_suffix text;
  v_old_weight numeric;
  v_new_weight numeric;
  v_min_weight numeric;
  v_max_weight numeric;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  v_products := public.order_products_summary(new.id);
  v_products_suffix := case
    when v_products is null or v_products = '' then ''
    else ' Produits : ' || v_products
  end;

  if new.status is distinct from old.status then
    if new.status = 'locked' then
      insert into public.notifications (
        profile_id,
        order_id,
        title,
        message,
        notification_type,
        event_key,
        data
      )
      select
        op.profile_id,
        new.id,
        'Commande clôturée',
        'La commande "' || new.title || '" est clôturée.',
        'order_locked_participant',
        'order_locked_participant:' || new.id,
        jsonb_build_object('status', new.status)
      from public.order_participants op
      where op.order_id = new.id
        and op.role = 'participant'
        and op.participation_status = 'accepted'
        and op.profile_id is not null
      on conflict (profile_id, event_key) do nothing;

      perform public.create_notification(
        new.producer_profile_id,
        'Commande clôturée',
        'Commande "' || new.title || '" clôturée.' || v_products_suffix,
        'order_locked_producer',
        'order_locked_producer:' || new.id,
        new.id,
        jsonb_build_object('products', v_products, 'status', new.status)
      );
    elsif new.status = 'delivered' then
      insert into public.notifications (
        profile_id,
        order_id,
        title,
        message,
        notification_type,
        event_key,
        data
      )
      select
        op.profile_id,
        new.id,
        'Commande reçue',
        'La commande "' || new.title || '" a été reçue par le partageur.',
        'order_delivered_participant',
        'order_delivered_participant:' || new.id,
        jsonb_build_object('status', new.status)
      from public.order_participants op
      where op.order_id = new.id
        and op.role = 'participant'
        and op.participation_status = 'accepted'
        and op.profile_id is not null
      on conflict (profile_id, event_key) do nothing;

      perform public.create_notification(
        new.producer_profile_id,
        'Commande reçue',
        'Les produits de la commande "' || new.title || '" ont été reçus par le partageur.' || v_products_suffix,
        'order_delivered_producer',
        'order_delivered_producer:' || new.id,
        new.id,
        jsonb_build_object('products', v_products, 'status', new.status)
      );
    elsif new.status = 'confirmed' then
      perform public.create_notification(
        new.sharer_profile_id,
        'Commande confirmée',
        'Le producteur a confirmé la commande "' || new.title || '".',
        'order_confirmed_sharer',
        'order_confirmed_sharer:' || new.id,
        new.id,
        jsonb_build_object('status', new.status)
      );
    elsif new.status = 'prepared' then
      perform public.create_notification(
        new.sharer_profile_id,
        'Commande préparée',
        'La commande "' || new.title || '" est préparée et prête à être livrée.',
        'order_prepared_sharer',
        'order_prepared_sharer:' || new.id,
        new.id,
        jsonb_build_object('status', new.status)
      );
    end if;
  end if;

  v_old_weight := coalesce(old.ordered_weight_kg, 0);
  v_new_weight := coalesce(new.ordered_weight_kg, 0);
  v_min_weight := coalesce(new.min_weight_kg, 0);
  v_max_weight := coalesce(new.max_weight_kg, 0);

  if v_new_weight <> v_old_weight then
    if v_min_weight > 0 and v_old_weight < v_min_weight and v_new_weight >= v_min_weight then
      perform public.create_notification(
        new.sharer_profile_id,
        'Seuil minimum atteint',
        'Votre commande "' || new.title || '" a atteint le seuil minimum (' || v_min_weight || ' kg).',
        'order_min_reached_sharer',
        'order_min_reached_sharer:' || new.id,
        new.id,
        jsonb_build_object('min_weight_kg', v_min_weight)
      );
    end if;

    if v_max_weight > 0 and v_old_weight < v_max_weight and v_new_weight >= v_max_weight then
      perform public.create_notification(
        new.sharer_profile_id,
        'Seuil maximum atteint',
        'Votre commande "' || new.title || '" a atteint le seuil maximum (' || v_max_weight || ' kg).',
        'order_max_reached_sharer',
        'order_max_reached_sharer:' || new.id,
        new.id,
        jsonb_build_object('max_weight_kg', v_max_weight)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_notify_updates on public.orders;
create trigger orders_notify_updates
  after update on public.orders
  for each row
  execute function public.notify_order_updates();

create or replace function public.close_orders_at_deadline()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_closed integer := 0;
begin
  for v_order in
    select *
    from public.orders
    where status = 'open'
      and deadline is not null
      and deadline <= current_date
  loop
    if coalesce(v_order.ordered_weight_kg, 0) >= coalesce(v_order.min_weight_kg, 0) then
      perform public.set_order_status(p_order_id => v_order.id, p_status => 'locked');

      perform public.create_notification(
        v_order.sharer_profile_id,
        'Commande clôturée automatiquement',
        'Date de clôture atteinte : la commande "' || v_order.title || '" a été clôturée automatiquement.',
        'order_auto_locked_deadline_sharer',
        'order_auto_locked_deadline_sharer:' || v_order.id,
        v_order.id,
        jsonb_build_object('deadline', v_order.deadline)
      );

      v_closed := v_closed + 1;
    end if;
  end loop;

  return v_closed;
end;
$$;

-- pg_cron setup (requires extension enabled in Supabase)
-- create extension if not exists pg_cron;
-- select current_database();
-- alter database "<db_name>" set cron.timezone = 'Europe/Paris';
-- select cron.schedule(
--   'close-orders-at-deadline',
--   '5 0 * * *',
--   $$select public.close_orders_at_deadline();$$
-- );
-- select * from cron.job;
-- select cron.unschedule('close-orders-at-deadline');
