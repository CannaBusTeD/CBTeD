-- Local replica of the live CBTeD production-controller schema (pre-migration), for testing only.
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END$$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE SCHEMA storage;
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL);

CREATE TABLE public.projects(id uuid NOT NULL DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), title text NOT NULL, description text, status text NOT NULL DEFAULT 'active'::text, current_studio text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT projects_pkey PRIMARY KEY (id), CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE);
CREATE TABLE public.sources(id uuid NOT NULL DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE, title text, PRIMARY KEY(id), UNIQUE(project_id,id));
CREATE TABLE public.source_versions(id uuid NOT NULL DEFAULT gen_random_uuid(), project_id uuid NOT NULL, source_id uuid NOT NULL, version_number integer NOT NULL, content text, storage_path text, based_on_id uuid, change_note text, created_at timestamptz NOT NULL DEFAULT now(), ideas text, suggested_text text,
 CONSTRAINT source_versions_pkey PRIMARY KEY (id), CONSTRAINT source_versions_project_id_id_key UNIQUE (project_id, id), CONSTRAINT source_versions_source_id_version_number_key UNIQUE (source_id, version_number),
 CONSTRAINT source_versions_project_id_source_id_fkey FOREIGN KEY (project_id, source_id) REFERENCES public.sources(project_id, id) ON DELETE CASCADE,
 CONSTRAINT source_versions_project_id_based_on_id_fkey FOREIGN KEY (project_id, based_on_id) REFERENCES public.source_versions(project_id, id));
CREATE TABLE public.project_rules(id uuid NOT NULL DEFAULT gen_random_uuid(), project_id uuid NOT NULL, scope text NOT NULL DEFAULT 'project'::text, rule_key text NOT NULL, revision_number integer NOT NULL DEFAULT 1, rule_kind text NOT NULL DEFAULT 'constraint'::text, body text NOT NULL, is_locked boolean NOT NULL DEFAULT true, supersedes_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT project_rules_pkey PRIMARY KEY (id), CONSTRAINT project_rules_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
 CONSTRAINT project_rules_project_id_id_key UNIQUE (project_id, id), CONSTRAINT project_rules_project_id_scope_rule_key_revision_number_key UNIQUE (project_id, scope, rule_key, revision_number),
 CONSTRAINT project_rules_project_id_supersedes_id_fkey FOREIGN KEY (project_id, supersedes_id) REFERENCES public.project_rules(project_id, id));
CREATE TABLE public.assets(id uuid NOT NULL DEFAULT gen_random_uuid(), project_id uuid NOT NULL, asset_role text NOT NULL DEFAULT 'other'::text, filename text, storage_path text NOT NULL, mime_type text, width integer, height integer, duration_ms integer, source_version_id uuid, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT assets_pkey PRIMARY KEY (id), CONSTRAINT assets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE, CONSTRAINT assets_project_id_id_key UNIQUE (project_id, id),
 CONSTRAINT assets_project_id_source_version_id_fkey FOREIGN KEY (project_id, source_version_id) REFERENCES public.source_versions(project_id, id),
 CONSTRAINT assets_duration_ms_check CHECK ((duration_ms >= 0)), CONSTRAINT assets_height_check CHECK ((height > 0)), CONSTRAINT assets_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
 CONSTRAINT assets_storage_path_check CHECK ((char_length(btrim(storage_path)) > 0)), CONSTRAINT assets_width_check CHECK ((width > 0)));
CREATE TABLE public.production_runs(id uuid NOT NULL DEFAULT gen_random_uuid(), project_id uuid NOT NULL, request_id uuid NOT NULL DEFAULT gen_random_uuid(), workflow text NOT NULL, intent text NOT NULL DEFAULT 'execute'::text, instructions text NOT NULL, source_version_id uuid, rules_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb, status text NOT NULL DEFAULT 'prepared'::text, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT production_runs_pkey PRIMARY KEY (id), CONSTRAINT production_runs_id_project_id_key UNIQUE (id, project_id), CONSTRAINT production_runs_project_id_request_id_key UNIQUE (project_id, request_id),
 CONSTRAINT production_runs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
 CONSTRAINT production_runs_instructions_check CHECK (((char_length(instructions) >= 1) AND (char_length(instructions) <= 20000))),
 CONSTRAINT production_runs_intent_check CHECK ((intent = 'execute'::text)),
 CONSTRAINT production_runs_status_check CHECK ((status = ANY (ARRAY['prepared'::text, 'active'::text, 'completed'::text, 'cancelled'::text, 'blocked'::text]))),
 CONSTRAINT production_runs_workflow_check CHECK ((workflow = ANY (ARRAY['writing'::text, 'writing_critique'::text, 'writing_suggestions'::text, 'writing_line_edit'::text, 'writing_rewrite'::text, 'visual'::text, 'animation'::text, 'song_video'::text]))));
CREATE TABLE public.production_steps(id uuid NOT NULL DEFAULT gen_random_uuid(), run_id uuid NOT NULL, project_id uuid NOT NULL, step_key text NOT NULL, sequence_index integer NOT NULL, agent text NOT NULL, studio text NOT NULL, kind text NOT NULL, depends_on text[] NOT NULL DEFAULT '{}'::text[], approval_required boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'pending'::text, attempt_number integer NOT NULL DEFAULT 0, output_text text, asset_id uuid, evidence jsonb NOT NULL DEFAULT '{}'::jsonb, started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT production_steps_pkey PRIMARY KEY (id), CONSTRAINT production_steps_run_id_sequence_index_key UNIQUE (run_id, sequence_index), CONSTRAINT production_steps_run_id_step_key_key UNIQUE (run_id, step_key),
 CONSTRAINT production_steps_run_id_project_id_fkey FOREIGN KEY (run_id, project_id) REFERENCES public.production_runs(id, project_id) ON DELETE CASCADE,
 CONSTRAINT production_steps_agent_check CHECK (((char_length(agent) >= 3) AND (char_length(agent) <= 120))),
 CONSTRAINT production_steps_attempt_number_check CHECK (((attempt_number >= 0) AND (attempt_number <= 5))),
 CONSTRAINT production_steps_kind_check CHECK ((kind = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'audio'::text]))),
 CONSTRAINT production_steps_sequence_index_check CHECK (((sequence_index >= 1) AND (sequence_index <= 200))),
 CONSTRAINT production_steps_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'passed'::text, 'failed'::text]))),
 CONSTRAINT production_steps_step_key_check CHECK (((char_length(step_key) >= 3) AND (char_length(step_key) <= 120))),
 CONSTRAINT production_steps_studio_check CHECK ((studio = ANY (ARRAY['writing'::text, 'visual'::text, 'audio'::text, 'animation'::text, 'core'::text]))));
CREATE TABLE public.production_approvals(id uuid NOT NULL DEFAULT gen_random_uuid(), run_id uuid NOT NULL, project_id uuid NOT NULL, step_key text NOT NULL, decision text NOT NULL, decided_by uuid NOT NULL, note text, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT production_approvals_pkey PRIMARY KEY (id), CONSTRAINT production_approvals_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id),
 CONSTRAINT production_approvals_run_id_project_id_fkey FOREIGN KEY (run_id, project_id) REFERENCES public.production_runs(id, project_id) ON DELETE CASCADE,
 CONSTRAINT production_approvals_run_id_step_key_fkey FOREIGN KEY (run_id, step_key) REFERENCES public.production_steps(run_id, step_key),
 CONSTRAINT production_approvals_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'rejected'::text, 'revoked'::text]))));
CREATE TABLE public.production_step_attempts(id uuid NOT NULL DEFAULT gen_random_uuid(), run_id uuid NOT NULL, project_id uuid NOT NULL, step_key text NOT NULL, attempt_number integer NOT NULL, status text NOT NULL, output_text text, evidence jsonb NOT NULL DEFAULT '{}'::jsonb, recorded_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT production_step_attempts_pkey PRIMARY KEY (id), CONSTRAINT production_step_attempts_run_id_step_key_attempt_number_key UNIQUE (run_id, step_key, attempt_number),
 CONSTRAINT production_step_attempts_run_id_project_id_fkey FOREIGN KEY (run_id, project_id) REFERENCES public.production_runs(id, project_id) ON DELETE CASCADE,
 CONSTRAINT production_step_attempts_attempt_number_check CHECK (((attempt_number >= 1) AND (attempt_number <= 5))),
 CONSTRAINT production_step_attempts_status_check CHECK ((status = ANY (ARRAY['passed'::text, 'failed'::text]))));
