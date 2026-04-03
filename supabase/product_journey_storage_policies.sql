insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-journey',
  'product-journey',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_journey_storage_select on storage.objects;
create policy product_journey_storage_select
  on storage.objects
  for select
  using (bucket_id = 'product-journey');

drop policy if exists product_journey_insert_own on storage.objects;
create policy product_journey_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-journey'
    and (
      auth.role() = 'service_role'
      or (auth.uid())::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists product_journey_update_own on storage.objects;
create policy product_journey_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-journey'
    and (
      auth.role() = 'service_role'
      or (auth.uid())::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'product-journey'
    and (
      auth.role() = 'service_role'
      or (auth.uid())::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists product_journey_delete_own on storage.objects;
create policy product_journey_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-journey'
    and (
      auth.role() = 'service_role'
      or (auth.uid())::text = (storage.foldername(name))[1]
    )
  );
