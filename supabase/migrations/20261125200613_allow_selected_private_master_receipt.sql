-- Both signed-in Studio and the scoped importer derive this immutable receipt from the same selection.
create policy cbted_selected_master_receipt_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'cbted-project-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[3] = 'master-handoffs'
  and cardinality(storage.foldername(name)) = 3
  and exists (
    select 1
    from public.projects p
    join public.handoffs h on h.project_id = p.id
    join public.cbted_media_jobs j on j.run_id::text = h.payload->>'run_id'
      and j.id::text = h.payload->>'music_job_id' and j.result_asset_id = h.asset_id
      and j.project_id = p.id and j.owner_id = p.owner_id
    cross join lateral (select encode(sha256(convert_to(
          '["studio_master_handoff_v1","' || p.owner_id::text || '","' || h.project_id::text ||
          '","' || (h.payload->>'run_id') || '","' || h.source_version_id::text ||
          '","' || (h.payload->>'music_job_id') || '","' || (h.payload->>'selected_full_song_id') || '"]',
          'UTF8')), 'hex') as hash) d
    where p.owner_id = (select auth.uid())
      and p.id::text = (storage.foldername(storage.objects.name))[2]
      and h.to_studio = 'visual' and h.payload->>'owner_selected_for_video' = 'true'
      and h.asset_id is not null and h.source_version_id is not null
      and j.kind = 'audio' and j.provider = 'suno'
      and storage.filename(storage.objects.name) = (substr(d.hash,1,8) || '-' || substr(d.hash,9,4) || '-5' || substr(d.hash,14,3) ||
          '-a' || substr(d.hash,18,3) || '-' || substr(d.hash,21,12) || '.json')
  )
);
