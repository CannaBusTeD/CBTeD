-- Canonical CBTeD migration (target project: dmzzyfiwtosxtyekpbfi)
-- Narrow, single-master, expiring, revocable grant for closed-browser private master import,
-- byte verification, immutable receipt attachment, and rejoin into normal review.
-- No generic delegation, no owner JWT storage, no credit spending, and no publishing.

CREATE TABLE IF NOT EXISTS public.cbted_master_import_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.production_runs(id) ON DELETE CASCADE,
  source_version_id uuid NOT NULL,
  music_job_id uuid NOT NULL REFERENCES public.cbted_media_jobs(id) ON DELETE CASCADE,
  handoff_id uuid,
  selected_full_song_id text NOT NULL CHECK (char_length(btrim(selected_full_song_id)) BETWEEN 3 AND 200),
  credential_digest bytea NOT NULL,
  generation integer NOT NULL DEFAULT 1 CHECK (generation >= 1),
  active boolean NOT NULL DEFAULT true,
  used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, project_id, run_id, music_job_id, selected_full_song_id),
  CONSTRAINT cbted_master_import_grants_run_project_fkey
    FOREIGN KEY (run_id, project_id) REFERENCES public.production_runs(id, project_id) ON DELETE CASCADE,
  CONSTRAINT cbted_master_import_grants_sv_project_fkey
    FOREIGN KEY (project_id, source_version_id) REFERENCES public.source_versions(project_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS cbted_master_import_grants_active_idx
  ON public.cbted_master_import_grants (run_id, music_job_id, selected_full_song_id)
  WHERE active = true AND revoked_at IS NULL;

ALTER TABLE public.cbted_master_import_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cbted_master_import_grants FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cbted_master_import_grants TO service_role;

CREATE OR REPLACE FUNCTION public.cbted_issue_master_import_grant(
  p_project uuid,
  p_run uuid,
  p_source_version uuid,
  p_music_job uuid,
  p_song_id text,
  p_secret text,
  p_handoff uuid DEFAULT NULL,
  p_ttl_minutes integer DEFAULT 360
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_song text := btrim(coalesce(p_song_id, ''));
  v_ttl integer := GREATEST(15, LEAST(COALESCE(p_ttl_minutes, 360), 1440));
  v_expires timestamptz := now() + make_interval(mins => v_ttl);
  v_row public.cbted_master_import_grants%ROWTYPE;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  IF p_secret IS NULL OR p_secret !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid scoped grant credential';
  END IF;
  IF char_length(v_song) < 3 OR char_length(v_song) > 200 THEN
    RAISE EXCEPTION 'Invalid selected_full_song_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project AND p.owner_id = v_owner
  ) THEN
    RAISE EXCEPTION 'Owned project required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.production_runs r
    WHERE r.id = p_run
      AND r.project_id = p_project
      AND r.source_version_id = p_source_version
      AND r.status NOT IN ('completed', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Active owned production run and matching source version required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cbted_media_jobs j
    WHERE j.id = p_music_job
      AND j.owner_id = v_owner
      AND j.project_id = p_project
      AND j.run_id = p_run
      AND j.provider = 'suno'
      AND j.kind = 'audio'
  ) THEN
    RAISE EXCEPTION 'Owned Suno audio job on this run required';
  END IF;

  IF p_handoff IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.handoffs h
      WHERE h.id = p_handoff
        AND h.project_id = p_project
        AND h.status = 'prepared'
        AND h.payload->>'run_id' = p_run::text
        AND h.payload->>'music_job_id' = p_music_job::text
        AND h.payload->>'source_version_id' = p_source_version::text
        AND h.payload->>'selected_full_song_id' = v_song
        AND h.payload->>'owner_selected_for_video' = 'true'
    ) THEN
      RAISE EXCEPTION 'Prepared owner-selected canonical handoff does not match this scope';
    END IF;
  END IF;

  INSERT INTO public.cbted_master_import_grants (
    owner_id, project_id, run_id, source_version_id, music_job_id,
    handoff_id, selected_full_song_id, credential_digest, generation,
    active, used_at, revoked_at, expires_at
  ) VALUES (
    v_owner, p_project, p_run, p_source_version, p_music_job,
    p_handoff, v_song, sha256(convert_to(p_secret, 'UTF8')), 1,
    true, NULL, NULL, v_expires
  )
  ON CONFLICT (owner_id, project_id, run_id, music_job_id, selected_full_song_id)
  DO UPDATE SET
    source_version_id = excluded.source_version_id,
    handoff_id = COALESCE(excluded.handoff_id, cbted_master_import_grants.handoff_id),
    credential_digest = excluded.credential_digest,
    generation = cbted_master_import_grants.generation + 1,
    active = true,
    used_at = NULL,
    revoked_at = NULL,
    expires_at = excluded.expires_at,
    updated_at = now()
  WHERE cbted_master_import_grants.owner_id = v_owner
    AND cbted_master_import_grants.source_version_id = excluded.source_version_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Conflicting source version on existing master import grant';
  END IF;

  RETURN jsonb_build_object(
    'grant_id', v_row.id,
    'generation', v_row.generation,
    'expires_at', v_row.expires_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cbted_issue_master_import_grant(uuid, uuid, uuid, uuid, text, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbted_issue_master_import_grant(uuid, uuid, uuid, uuid, text, text, uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.cbted_revoke_master_import_grant(
  p_run uuid,
  p_music_job uuid,
  p_song_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  UPDATE public.cbted_master_import_grants
  SET active = false,
      revoked_at = COALESCE(revoked_at, now()),
      updated_at = now()
  WHERE owner_id = v_owner
    AND run_id = p_run
    AND music_job_id = p_music_job
    AND (p_song_id IS NULL OR selected_full_song_id = btrim(p_song_id))
    AND active = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.cbted_revoke_master_import_grant(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbted_revoke_master_import_grant(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cbted_verify_master_import_grant(
  p_run uuid,
  p_music_job uuid,
  p_song_id text,
  p_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_song text := btrim(coalesce(p_song_id, ''));
  v_grant public.cbted_master_import_grants%ROWTYPE;
BEGIN
  IF p_secret IS NULL OR p_secret !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid scoped grant credential';
  END IF;

  SELECT g.* INTO v_grant
  FROM public.cbted_master_import_grants g
  JOIN public.projects p ON p.id = g.project_id AND p.owner_id = g.owner_id
  JOIN public.production_runs r
    ON r.id = g.run_id
   AND r.project_id = g.project_id
   AND r.source_version_id = g.source_version_id
   AND r.status NOT IN ('completed', 'cancelled')
  JOIN public.cbted_media_jobs j
    ON j.id = g.music_job_id
   AND j.owner_id = g.owner_id
   AND j.project_id = g.project_id
   AND j.run_id = g.run_id
   AND j.provider = 'suno'
   AND j.kind = 'audio'
  WHERE g.run_id = p_run
    AND g.music_job_id = p_music_job
    AND g.selected_full_song_id = v_song
    AND g.credential_digest = sha256(convert_to(p_secret, 'UTF8'))
    AND g.active = true
    AND g.revoked_at IS NULL
    AND g.expires_at > now()
  FOR UPDATE OF g;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inactive, expired, or mismatched scoped master import grant';
  END IF;

  RETURN jsonb_build_object(
    'grant_id', v_grant.id,
    'owner_id', v_grant.owner_id,
    'project_id', v_grant.project_id,
    'run_id', v_grant.run_id,
    'source_version_id', v_grant.source_version_id,
    'music_job_id', v_grant.music_job_id,
    'handoff_id', v_grant.handoff_id,
    'selected_full_song_id', v_grant.selected_full_song_id,
    'generation', v_grant.generation,
    'expires_at', v_grant.expires_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cbted_verify_master_import_grant(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cbted_verify_master_import_grant(uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.cbted_mark_master_import_grant_used(
  p_grant_id uuid,
  p_generation integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.cbted_master_import_grants
  SET active = false,
      used_at = COALESCE(used_at, now()),
      updated_at = now()
  WHERE id = p_grant_id
    AND generation = p_generation;
END;
$$;
REVOKE ALL ON FUNCTION public.cbted_mark_master_import_grant_used(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cbted_mark_master_import_grant_used(uuid, integer) TO service_role;