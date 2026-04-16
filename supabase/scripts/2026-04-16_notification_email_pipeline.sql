begin;

alter table public.profiles
  add column if not exists notification_email_preferences jsonb;

update public.profiles
set notification_email_preferences = '{}'::jsonb
where notification_email_preferences is null;

alter table public.profiles
  alter column notification_email_preferences set default '{}'::jsonb;

alter table public.profiles
  alter column notification_email_preferences set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_notification_email_preferences_is_object'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_notification_email_preferences_is_object
      check (jsonb_typeof(notification_email_preferences) = 'object');
  end if;
end $$;

create table if not exists public.notification_emails_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  try_count integer not null default 0,
  last_error text null,
  created_at timestamptz not null default now(),
  locked_at timestamptz null,
  sent_at timestamptz null,
  provider_message_id text null,
  constraint notification_emails_outbox_status_check
    check (status in ('pending', 'processing', 'sent', 'failed'))
);

create unique index if not exists notification_emails_outbox_notification_id_key
  on public.notification_emails_outbox(notification_id);

create index if not exists notification_emails_outbox_status_created_at_idx
  on public.notification_emails_outbox(status, created_at asc);

create index if not exists notification_emails_outbox_profile_created_at_idx
  on public.notification_emails_outbox(profile_id, created_at desc);

alter table public.notification_emails_outbox enable row level security;

create or replace function public.is_supported_notification_email_type(p_type text)
returns boolean
language sql
immutable
as $function$
  select coalesce(p_type, '') in (
    'order_created_producer',
    'order_locked_participant',
    'order_locked_producer',
    'order_delivered_participant',
    'order_delivered_producer',
    'order_confirmed_sharer',
    'order_prepared_sharer',
    'order_min_reached_sharer',
    'order_max_reached_sharer',
    'order_auto_locked_deadline_sharer'
  );
$function$;

create or replace function public.is_notification_email_enabled(
  p_preferences jsonb,
  p_notification_type text
)
returns boolean
language plpgsql
immutable
as $function$
declare
  v_raw text;
begin
  if not public.is_supported_notification_email_type(p_notification_type) then
    return false;
  end if;

  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    return true;
  end if;

  if not (p_preferences ? p_notification_type) then
    return true;
  end if;

  v_raw := lower(coalesce(p_preferences ->> p_notification_type, ''));
  return v_raw not in ('false', 'f', '0', 'off', 'no');
end;
$function$;

create or replace function public.enqueue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_preferences jsonb;
begin
  if new.profile_id is null then
    return new;
  end if;

  if not public.is_supported_notification_email_type(new.notification_type) then
    return new;
  end if;

  select p.notification_email_preferences
  into v_preferences
  from public.profiles p
  where p.id = new.profile_id;

  if not public.is_notification_email_enabled(v_preferences, new.notification_type) then
    return new;
  end if;

  insert into public.notification_emails_outbox (
    notification_id,
    profile_id,
    notification_type,
    payload
  )
  values (
    new.id,
    new.profile_id,
    new.notification_type,
    jsonb_strip_nulls(
      jsonb_build_object(
        'notification_id', new.id,
        'profile_id', new.profile_id,
        'notification_type', new.notification_type,
        'title', new.title,
        'message', new.message,
        'order_id', new.order_id,
        'event_key', new.event_key,
        'data', new.data,
        'created_at', new.created_at
      )
    )
  )
  on conflict (notification_id) do nothing;

  return new;
end;
$function$;

drop trigger if exists notifications_enqueue_email on public.notifications;
create trigger notifications_enqueue_email
  after insert on public.notifications
  for each row
  execute function public.enqueue_notification_email();

create or replace function public.dequeue_notification_emails(p_limit integer default 10)
returns setof public.notification_emails_outbox
language plpgsql
security definer
as $function$
begin
  return query
  with picked as (
    select id
    from public.notification_emails_outbox
    where status = 'pending'
      and (locked_at is null or locked_at < now() - interval '15 minutes')
    order by created_at asc
    for update skip locked
    limit p_limit
  )
  update public.notification_emails_outbox e
  set status = 'processing',
      locked_at = now(),
      try_count = e.try_count + 1
  where e.id in (select id from picked)
  returning e.*;
end;
$function$;

create or replace function public.call_process_notification_emails()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $function$
declare
  v_project_url text;
  v_internal_secret text;
  v_service_role text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'project_url';

  select decrypted_secret into v_internal_secret
  from vault.decrypted_secrets
  where name = 'notification_email_internal_secret';

  select decrypted_secret into v_service_role
  from vault.decrypted_secrets
  where name = 'service_role_key';

  if v_project_url is null or v_internal_secret is null then
    raise exception 'Missing project_url or notification_email_internal_secret in vault';
  end if;

  if v_service_role is null then
    raise exception 'Missing service_role_key in vault';
  end if;

  perform net.check_worker_is_up();

  perform net.http_post(
    url := v_project_url || '/functions/v1/process-notification-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_internal_secret,
      'Authorization', 'Bearer ' || v_service_role,
      'apikey', v_service_role
    ),
    body := jsonb_build_object('mode', 'scan_pending')
  );
end;
$function$;

do $$
declare
  v_existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      select jobid
      into v_existing_job_id
      from cron.job
      where jobname = 'process-notification-emails'
      limit 1;

      if v_existing_job_id is not null then
        perform cron.unschedule(v_existing_job_id);
      end if;
    exception
      when undefined_table or insufficient_privilege then
        null;
    end;

    begin
      perform cron.schedule(
        'process-notification-emails',
        '* * * * *',
        $$select public.call_process_notification_emails();$$
      );
    exception
      when duplicate_object then
        null;
    end;
  end if;
end $$;

commit;
