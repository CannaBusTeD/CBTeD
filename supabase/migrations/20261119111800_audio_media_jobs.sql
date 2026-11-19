-- Make music and narration first-class saved media jobs, without
-- weakening source ownership or approval rules.
alter table public.cbted_media_jobs drop constraint if exists cbted_media_jobs_provider_check;
alter table public.cbted_media_jobs add constraint cbted_media_jobs_provider_check
 check(provider in ('chatgpt','runway','higgsfield','suno','elevenlabs'));
alter table public.cbted_media_jobs drop constraint if exists cbted_media_jobs_kind_check;
alter table public.cbted_media_jobs add constraint cbted_media_jobs_kind_check
 check(kind in ('image','video','audio'));
