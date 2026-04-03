alter table public.legal_entities
  add column if not exists stripe_account_id text,
  add column if not exists stripe_account_country text;

create unique index if not exists legal_entities_stripe_account_id_uidx
  on public.legal_entities (stripe_account_id)
  where stripe_account_id is not null;
