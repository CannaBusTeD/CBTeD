create policy cbted_project_assets_owner_storyboard_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'cbted-project-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[3] = 'storyboards'
  and cardinality(storage.foldername(name)) = 3
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}\.json$'
  and exists (
    select 1 from public.projects p
    where p.id::text = (storage.foldername(storage.objects.name))[2]
      and p.owner_id = (select auth.uid())
  )
);