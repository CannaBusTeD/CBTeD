-- Applied to the CBTeD Supabase project on 2026-11-02.
-- Recorded migration version: 20261102231044
-- This file documents an ALREADY APPLIED migration. Do not execute it twice.
-- Preserve original content in existing versions and store optional ideas and
-- suggested alternative writing independently in each new version.

alter table public.source_versions
  add column ideas text,
  add column suggested_text text;

alter table public.source_versions
  drop constraint source_versions_actual_content;

alter table public.source_versions
  add constraint source_versions_actual_content check (
    nullif(btrim(coalesce(content,'')),'') is not null
    or nullif(btrim(coalesce(ideas,'')),'') is not null
    or nullif(btrim(coalesce(suggested_text,'')),'') is not null
    or nullif(btrim(coalesce(storage_path,'')),'') is not null
  );
