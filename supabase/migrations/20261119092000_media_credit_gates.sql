-- Project-scoped media-generation jobs. No credits can be spent by this schema.
-- Runtime submits are delegated to authenticated ChatGPT provider connectors;
-- the controller records per-job credit approval and verified media evidence.
create table if not exists public.cbted_media_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 run_id uuid references public.production_runs(id) on delete set null,
 step_key text,
 provider text not null check(provider in ('chatgpt','runway','higgsfield')),
 kind text not null check(kind in ('image','video')),
 model text,
 prompt text not null check(char_length(prompt) between 1 and 20000),
 settings jsonb not null default '{}'::jsonb,
 source_asset_id uuid references public.assets(id) on delete set null,
 quote_credits numeric(12,3) check(quote_credits between 0 and 100000),
 quote_observed_at timestamptz,
 allowance_included_remaining numeric(12,3) check(allowance_included_remaining >= 0),
 allowance_source text not null default 'unknown' check(allowance_source in ('unknown','provider_tool','user_entered')),
 allowance_observed_at timestamptz,
 billing_mode text not null default 'credits' check(billing_mode in ('credits','native','free_generation')),
 quote_fingerprint text not null default '',
 status text not null default 'awaiting_quote'
 check(status in ('awaiting_quote','awaiting_approval','ready','approved','claimed','submitted','needs_review','completed','failed','rejected','cancelled')),
 approval_required boolean not null default true,
 approval_reason text not null default 'Quote required',
 approved_max_credits numeric(12,3),
 approved_fingerprint text,
 approved_at timestamptz,
 claimed_at timestamptz,
 submitted_at timestamptz,
 provider_job_id text,
 result_asset_id uuid references public.assets(id) on delete set null,
 failure_reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,provider,provider_job_id)
);
create index if not exists cbted_media_jobs_owner_project_idx on public.cbted_media_jobs(owner_id,project_id,created_at desc);
create index if not exists cbted_media_jobs_pending_idx on public.cbted_media_jobs(project_id,status,created_at desc);
alter table public.cbted_media_jobs enable row level security;
revoke all on public.cbted_media_jobs from public,anon,authenticated;
grant select on public.cbted_media_jobs to authenticated;
drop policy if exists cbted_media_jobs_owner_read on public.cbted_media_jobs;
create policy cbted_media_jobs_owner_read on public.cbted_media_jobs
 for select to authenticated using(owner_id=(select auth.uid()));

create table if not exists public.cbted_media_job_events (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 job_id uuid not null references public.cbted_media_jobs(id) on delete cascade,
 event text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists cbted_media_job_events_idx on public.cbted_media_job_events(job_id,created_at desc);
alter table public.cbted_media_job_events enable row level security;
revoke all on public.cbted_media_job_events from public,anon,authenticated;
grant select on public.cbted_media_job_events to authenticated;
drop policy if exists cbted_media_job_events_owner_read on public.cbted_media_job_events;
create policy cbted_media_job_events_owner_read on public.cbted_media_job_events
 for select to authenticated using(owner_id=(select auth.uid()));

-- One-time claim. Atomically prevents racing jobs from double-spending one
-- observed monthly-included balance. Claims are NOT proof a provider spent credits.
create or replace function public.cbted_claim_media_job(p_job uuid)
 returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 v_uid uuid:=auth.uid();
 v_job public.cbted_media_jobs%rowtype;
 v_reserved numeric(12,3):=0;
begin
 if v_uid is null then raise exception 'Sign in required'; end if;
 select * into v_job from public.cbted_media_jobs where id=p_job and owner_id=v_uid for update;
 if not found then raise exception 'Media job not found'; end if;
 if v_job.status not in ('ready','approved') then raise exception 'Media job is not authorised for generation'; end if;
 if v_job.provider <> 'chatgpt' then
   if v_job.quote_credits is null or v_job.quote_observed_at is null
      or v_job.quote_observed_at < now() - CASE WHEN v_job.status='approved' THEN interval '15 minutes' ELSE interval '2 minutes' END
   then raise exception 'Credit quote expired: check credits again'; end if;
   if v_job.status='ready' then
     if v_job.allowance_source <> 'provider_tool' or v_job.allowance_observed_at is null
        or v_job.allowance_observed_at < now()-interval '2 minutes'
        or v_job.allowance_included_remaining is null
     then raise exception 'Fresh included-allowance verification required'; end if;
     perform pg_advisory_xact_lock(hashtext(v_uid::text),hashtext(v_job.provider));
     select coalesce(sum(j.quote_credits),0) into v_reserved
     from public.cbted_media_jobs j where j.owner_id=v_uid and j.provider=v_job.provider
      and j.id<>v_job.id and j.claimed_at >= v_job.allowance_observed_at
      and j.status in ('claimed','submitted','completed','failed');
     if v_job.quote_credits+v_reserved>v_job.allowance_included_remaining then
       update public.cbted_media_jobs set status='awaiting_approval',
        approval_required=true,approval_reason='Monthly included allowance exhausted by other generation jobs',
        updated_at=now() where id=p_job;
       return jsonb_build_object('claimed',false,'approval_required',true,
           'reason','Included allowance is insufficient. Request a specific credit approval.');
     end if;
   else
     if v_job.approved_at is null or v_job.approved_fingerprint is distinct from v_job.quote_fingerprint
        or v_job.approved_max_credits < v_job.quote_credits
     then raise exception 'Quote changed or approved credit maximum is insufficient'; end if;
   end if;
 end if;
 update public.cbted_media_jobs set status='claimed',claimed_at=now(),updated_at=now() where id=p_job;
 insert into public.cbted_media_job_events(owner_id,job_id,event,details)
 values(v_uid,p_job,'claimed',jsonb_build_object('provider',v_job.provider,'credits',v_job.quote_credits));
 return jsonb_build_object('claimed',true,'provider',v_job.provider,'kind',v_job.kind,
   'max_credits',v_job.quote_credits,'quote_fingerprint',v_job.quote_fingerprint);
end $fn$;
revoke all on function public.cbted_claim_media_job(uuid) from public,anon;
grant execute on function public.cbted_claim_media_job(uuid) to authenticated;
