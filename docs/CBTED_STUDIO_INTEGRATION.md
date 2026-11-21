# CBTeD StudioS: canonical integration and release contract

**Product name: CBTeD StudioS** (with a capital final S). "CBTeD" remains the internal legacy prefix for the existing repository, MCP plugin, API routes and SQL identifiers; renaming those identifiers would break existing clients. All user-facing Studio branding uses "CBTeD StudioS".

## One product, three responsibilities

- **GitHub `CannaBusTeD/CBTeD`** is the source of truth for tracked rules, execution code, migrations and tests.
- **Existing Supabase project `dmzzyfiwtosxtyekpbfi`** is authoritative for creative projects, source versions, rules, assets, tasks, production runs/steps, approvals and audit evidence. The CBTeD OAuth/MCP and orchestrator Edge Functions stay in this project.
- **Existing Lovable project `2cde2b1a-a345-4831-8ca6-aaf5597c44e7`** is the CBTeD StudioS web application, INCLUDING its pre-existing video publisher. Lovable Cloud retains its own publisher/account database, but its interim `studio_*` creative demo records MUST NOT become a second source of authoritative creative projects. Never delete these records without an explicit migration/back-up plan.

A Python LangGraph worker is an optional execution engine behind the current authenticated orchestrator, **not** a replacement Supabase database or a new master of approval state. Supabase Deno Edge Functions cannot run a Python LangGraph worker directly; host the worker separately and connect only after security tests and explicit provider/cost approval.

## Integration contract

1. Lovable creates a separate Supabase client for the existing CBTeD project using its **publishable** API key. Users must obtain a real **CBTeD** Supabase Auth session. The existing Lovable Cloud session alone is not a CBTeD session.
2. All private reads/writes in CBTeD are sent with the actual CBTeD user token. Owner-scoped RLS and existing narrow RPCs apply. No service-role/secret key, API token or user password is ever exposed in browser, GitHub or public docs.
3. For planning, claiming, approving, finishing and retrying production steps, call the **existing authenticated orchestrator/RPC contracts**. Do NOT directly mark steps passed/complete through generic table updates and do NOT introduce parallel `studio_projects` in the canonical database.
4. **Status is evidence-based**. Show `unconfigured`, `needs_sign_in`, `connected_read_only`, `ready_for_execution`, `blocked`, `in_review`, `approved` and `completed` based on actual API responses, not on an AI assertion.
5. Keep immutable source/asset version references. A new user instruction opens a new version; completed versions are terminal and skipped on resume. An existing successful job result must be reused instead of submitting again. A failed step can retry only after checking the previous completed stages and maximum attempt/cost limits. A `SUCCEEDED` provider job alone is not artistic approval.
6. Every new creative output should undergo at least two *genuinely independent* quality reviews against its actual artifact and exact version, followed by a separate final full-audio/video audit before release. Existing backend does **not yet enforce this requirement universally**; do not misrepresent it as operational. Human approval and actual media verification remain necessary.
7. Failure must be local: preserve successful earlier steps and assets; repair only what actually failed; never regenerate completed work just to follow an old loop.
8. Automatic posting, paid model calls, and media generation stay **disabled** until their actual provider connection, test, required permissions and spend caps have been verified. Drafting and planning can run without them.

## Deployment / acceptance sequence

- [x] Supabase project, project/rules/assets tables, authenticated MCP and controlled Edge orchestrator exist.
- [x] Lovable Studio page scaffolding, local demo approvals and publisher features exist.
- [x] Public Supabase health check can return HTTP 200 with a publishable key.
- [ ] Lovable external **CBTeD Auth** implemented and real signed-in project reads verified. RLS test: user A cannot read user B.
- [ ] Lovable Studio projects/writing/review/run-status use **canonical Supabase records**, not local Lovable `studio_*` records.
- [ ] Real reviewer identity/evidence, immutable artifact version sign-off, and two independent gates enforced server-side on canonical production steps.
- [ ] Producer dispatch is idempotent per project/run/step/version, retries are bounded, and completed runs cannot re-run on refresh or replay.
- [ ] LangGraph worker deployed to an authorised Python runtime with durable PostgreSQL checkpointing and authentication; existing orchestrator remains stage/approval authority.
- [ ] Real optional audio/image/video/lip-sync/FFmpeg assembly adapters tested end-to-end with actual files and approved cost ceilings.
- [ ] Full-film technical and creative audits verified on playable final exports.
- [ ] Publisher connected to eligible approved export with explicit publication approval and verified external post status.
- [ ] Integration tests plus screen-reader checks pass in Lovable; production release explicitly approved.

## Release definition

"CBTeD StudioS fully integrated" is allowed only when *the same* authorised project and asset/version data are visible through Lovable, CBTeD MCP and canonical Supabase, and a verified completed run stays complete after reload/retry. "Full creative production" additionally requires real provider integrations and successful media assembly. Never use a placeholder page, test-mode success or a health ping as proof of completed integration.
