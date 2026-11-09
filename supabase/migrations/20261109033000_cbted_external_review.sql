-- CBTeD private final-review workspace. Public forum membership never grants table access.
-- Applied to live Supabase separately; this idempotent source migration preserves future deployments.
create table if not exists public.review_requests (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 output_id uuid references public.outputs(id) on delete set null,
 requested_by uuid not null references auth.users(id),
 status text not null default 'draft' check (status in ('draft','approved','inviting','in_review','completed','cancelled')),
 brief text not null default '',
 review_package jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 approved_at timestamptz,
 constraint review_package_object check (jsonb_typeof(review_package)='object')
);
create table if not exists public.reviewers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 display_name text not null,
 external_agent_id text,
 provider text not null default 'manual',
 verified boolean not null default false,
 verification_note text,
 created_at timestamptz not null default now()
);
create table if not exists public.invitations (
 id uuid primary key default gen_random_uuid(),
 review_id uuid not null references public.review_requests(id) on delete cascade,
 reviewer_id uuid not null references public.reviewers(id),
 status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
 expires_at timestamptz not null default (now()+interval '24 hours'),
 token_sha256 text unique,
 accepted_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 unique(review_id, reviewer_id)
);
create table if not exists public.feedback (
 id uuid primary key default gen_random_uuid(),
 invitation_id uuid not null references public.invitations(id) on delete cascade,
 critique text not null,
 recommendations jsonb not null default '[]'::jsonb,
 received_at timestamptz not null default now()
);
-- Handles projects whose earliest review migration was applied before owner-scoping.
alter table public.reviewers add column if not exists owner_id uuid references auth.users(id);
alter table public.reviewers add column if not exists verification_note text;
alter table public.reviewers alter column owner_id set not null;
alter table public.review_requests add column if not exists review_package jsonb not null default '{}'::jsonb;
alter table public.invitations add column if not exists token_sha256 text unique;
alter table public.invitations add column if not exists accepted_at timestamptz;
alter table public.invitations add column if not exists revoked_at timestamptz;
create index if not exists cbted_review_requests_project_idx on public.review_requests(project_id,created_at desc);
create index if not exists cbted_reviewers_owner_idx on public.reviewers(owner_id,created_at desc);
create index if not exists cbted_review_invitations_review_idx on public.invitations(review_id);
create unique index if not exists cbted_review_feedback_once_idx on public.feedback(invitation_id);
alter table public.review_requests enable row level security;
alter table public.reviewers enable row level security;
alter table public.invitations enable row level security;
alter table public.feedback enable row level security;
alter table public.review_requests force row level security;
alter table public.reviewers force row level security;
alter table public.invitations force row level security;
alter table public.feedback force row level security;
revoke all on public.review_requests,public.reviewers,public.invitations,public.feedback from public,anon,authenticated;
grant select,insert,update,delete on public.review_requests,public.reviewers,public.invitations,public.feedback to service_role;
-- Deliberately no general SELECT/WRITE policies. Access is only through the gated Edge Function.
