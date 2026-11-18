-- CBTeD social authorisation and creator-approved publishing metadata.
-- All social tokens are encrypted by Edge Functions; secrets are NEVER exposed through RLS.
create table if not exists public.cbted_social_oauth_states (
 state_hash text primary key check (length(state_hash)=64),
 owner_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check (provider in ('youtube','facebook','instagram','tiktok','x')),
 expected_handle text,
 code_verifier text,
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists cbted_social_oauth_states_expiry on public.cbted_social_oauth_states(expires_at);
alter table public.cbted_social_oauth_states enable row level security;
revoke all on public.cbted_social_oauth_states from anon, authenticated;

create table if not exists public.cbted_social_connections (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check (provider in ('youtube','facebook','instagram','tiktok','x')),
 remote_account_id text not null,
 account_handle text,
 display_name text,
 profile_url text,
 requested_handle text,
 status text not null default 'needs_confirmation'
   check (status in ('needs_confirmation','active','needs_permission','expired','disconnected')),
 scopes text[] not null default '{}',
 post_permission boolean not null default false,
 token_expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,provider,remote_account_id)
);
create index if not exists cbted_social_connections_owner on public.cbted_social_connections(owner_id);
alter table public.cbted_social_connections enable row level security;
revoke all on public.cbted_social_connections from anon;
grant select on public.cbted_social_connections to authenticated;
drop policy if exists cbted_social_connections_select on public.cbted_social_connections;
create policy cbted_social_connections_select on public.cbted_social_connections for select to authenticated using ((select auth.uid())=owner_id);

create table if not exists public.cbted_social_credentials (
 connection_id uuid primary key references public.cbted_social_connections(id) on delete cascade,
 token_ciphertext text not null,
 token_nonce text not null,
 updated_at timestamptz not null default now()
);
alter table public.cbted_social_credentials enable row level security;
revoke all on public.cbted_social_credentials from anon, authenticated;

create table if not exists public.cbted_social_post_requests (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 asset_id uuid not null references public.assets(id),
 connection_id uuid not null references public.cbted_social_connections(id) on delete cascade,
 title text not null default '',
 caption text not null default '',
 privacy text not null default 'private' check (privacy in ('private','unlisted','public')),
 scheduled_at timestamptz,
 status text not null default 'awaiting_approval'
  check(status in ('awaiting_approval','approved','queued','submitted','completed','failed','cancelled')),
 approved_at timestamptz,
 approved_by uuid references auth.users(id),
 remote_post_id text,
 failure_reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists cbted_social_post_owner on public.cbted_social_post_requests(owner_id,created_at desc);
alter table public.cbted_social_post_requests enable row level security;
revoke all on public.cbted_social_post_requests from anon;
grant select on public.cbted_social_post_requests to authenticated;
drop policy if exists cbted_social_post_requests_select on public.cbted_social_post_requests;
create policy cbted_social_post_requests_select on public.cbted_social_post_requests for select to authenticated using ((select auth.uid())=owner_id);

comment on table public.cbted_social_oauth_states is 'One-use OAuth CSRF state, only service-role backend may access';
comment on table public.cbted_social_credentials is 'Encrypted platform OAuth tokens, never exposed to client or MCP';
comment on table public.cbted_social_post_requests is 'Drafts and user approvals; actual publishing requires a separate verified provider adapter';
