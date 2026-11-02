# CBTeD Shared Project Database

Status: **Initial database schema and private project asset storage deployed**. This document describes the current state of CBTeD Supabase. The studios are not yet connected to an application.

## Deployment

- Dedicated Supabase project: **CBTeD**.
- Schema: `public`.
- Applied migration: `20261102214053_create_cbted_shared_project_foundation` (name: `create_cbted_shared_project_foundation`).
- Project was empty before deployment. Ten tables were created.
- All ten tables have PostgreSQL row-level security (RLS) enabled.
- The owner is identified by Supabase Authentication user ID (`auth.uid()`).
- At this stage each project has **one owner**, not a collaboration/membership model.
- Anonymous role has no SELECT privilege on any of these ten tables.
- All user access to these tables is restricted by RLS policies to the project's owner.
- Public-client deletion is not granted. Versions, rules, approvals, outputs and history are append-only from the client API's perspective.
- Supabase security advisors reported **zero lints** after schema deployment and again after storage configuration.
- Storage migration: `20261102214953_create_cbted_private_assets_storage` (name: `create_cbted_private_assets_storage`).
- Private Storage bucket: `cbted-project-assets` (`public = false`). The bucket currently has no uploaded user assets.

## Database tables

| Table | Responsibility | Relationships and protections |
| --- | --- | --- |
| `projects` | Project identity, owner, title, description, active/archive status, current studio | `owner_id` references `auth.users.id`; only owner may read, create or update |
| `sources` | Logical writing/source document and its type | Belongs to a project; can have many source versions |
| `source_versions` | Immutable numbered writing snapshots with separate `content` (current lyrics/writing), `ideas` (user notes) and `suggested_text` (alternative wording), plus optional storage path and previous-version reference | Belongs to a source in the *same project*; unique source/version number; a version can contain ideas alone |
| `project_rules` | Versioned project rules, corrections, decisions, preferences and continuity constraints | Scope may be project/writing/visual/animation; revision numbers, supersession links, locked flag |
| `assets` | Metadata and private storage paths for uploaded references and generated files | Role, dimensions, duration, MIME type, linked source version; the private bucket is provisioned, but file uploads are not yet connected |
| `tasks` | Studio activity and step/progress tracking | Writing/visual/animation, operation, status, current step, requested and completed units, input sources/assets |
| `outputs` | Result records for text/images/videos/prompts/etc. | Linked task, optional source/asset, sequence index, verification status; preserve attempts |
| `approvals` | Append-only decisions approving, rejecting or revoking a source version, asset or output | Each event names **exactly one** target in the same project and records the acting authenticated user |
| `handoffs` | Transfers between two different studios | Records from/to studio, linked task/source/asset/output, state and handoff payload |
| `activity_events` | Append-only project/task action history | Type, acting user, details, timestamp and project ownership |

Project-scoped foreign keys include the project ID, preventing a task, asset, source version, approval or handoff from silently referencing a record in another project. This complements the row-level security policies.

## Intended operations

1. A signed-in user creates a `projects` row.
2. Writing source material is stored in `sources` and `source_versions` without overwriting prior versions.
3. Project-specific rules/corrections are appended to `project_rules`. The core application must resolve which revisions are current.
4. Reference or output **file metadata** lives in `assets`. The private `cbted-project-assets` bucket is provisioned with authenticated owner-only read and insert policies, but the file-upload application integration is not yet implemented.
5. Each studio operation gets a `tasks` record with the next step and required output count.
6. Completed attempts are written to `outputs`, with verification state.
7. User approval is recorded in `approvals`; the receiving studio checks approved source and assets rather than trusting a summary.
8. `handoffs` connects independent studios while leaving source and prior results intact.
9. `activity_events` records significant actions for traceability.


## Writing-field separation

- Applied Supabase migration: `20261102231044_separate_writing_draft_ideas_suggestions`.
- Additive columns on `public.source_versions`: `ideas text`, `suggested_text text`; the existing `content` column is unchanged.
- The nonempty-version check now accepts existing content, ideas, suggested text or a storage file. A user can save ideas before writing any lyrics.
- Every version retains all three fields as one snapshot, but each field stays clearly separated. Suggested lines do **not** replace current lyrics or become automatically approved.
- Migration SQL is retained under `supabase/recorded-migrations/` as an already-applied reference, not a script to run again.

## Private asset storage configuration

- Bucket: `cbted-project-assets`; private, never public.
- Object-key convention: `<authenticated-user-uuid>/<project-uuid>/<category>/<unique-filename>`.
- Allowed categories: `writing`, `references`, `images`, `videos`, `audio`, `exports`, `other`.
- **SELECT** is permitted to an authenticated user only when the object key's user prefix matches their authenticated UUID AND the project UUID identifies a project they own.
- **INSERT** has the same ownership checks, plus a recognised category segment. There are deliberately no ordinary-client UPDATE or DELETE policies; store each new version at a new path to avoid unwanted overwrites.
- The underlying `storage.objects` table has RLS enabled. Both policies were inspected after migration, and security advisors reported zero lints.
- No application-level sign-in, actual upload, private-download or cross-user denial test has yet run. Do not claim that working end-to-end user uploads have been verified.
- A file's metadata in `public.assets` does not automatically upload or grant access to the file. The future app must verify file-key consistency with project ownership.
- Bucket has no explicit per-file limit configured; the Supabase plan/provider upload limits still apply. Large video delivery must be designed around the actual plan capabilities.

## What is **not** implemented yet

- Live sign-in-driven file uploads/downloads and actual user files. The private bucket and owner-scoped SELECT/INSERT Storage policies are installed, but no end-to-end authenticated upload/download has been run.
- A working and verified authenticated browser session. The sign-in UI now exists under `app/`, but user sign-in is not yet live-tested.
- A CBTeD studio execution coordinator/MCP server that invokes actual generation providers. The first browser project manager code now accesses project records through the Supabase Data API, subject to RLS.
- Automated studio workflow advancement and full state transition coordination. The browser application has explicit source-version approval and latest-version selection, but they have not yet passed authenticated end-to-end testing.
- Integration of the three studio instruction contracts with the live database.
- A published public CBTeD plugin. The first browser user interface has been committed under `app/` and a Pages workflow added, but live hosting is not yet verified.
- Live owner/other-user RLS interaction tests; the current verification was schema/policy/grant inspection plus Supabase security advisors.

Do not claim any of those capabilities have been delivered just because the schema exists.

## Project manager implementation

- `app/` contains the browser interface for sign-in, creating projects, versioned writing, project rules, approvals, private files, task records and a Writing-to-Visual handoff record.
- `.github/workflows/deploy-cbted-manager.yml` deploys the static app when GitHub Pages is enabled with GitHub Actions as its source.
- `cbted-public-config` is a deployed Supabase Edge Function exposing only the browser-safe publishable key, Supabase project URL and bucket name. It never exposes database secrets.
- Supabase Auth redirect settings still need configuring for the published site. No real account or cross-user end-to-end tests have been performed yet.

## Security and workflow invariants

- Keep the public GitHub repository free of private user content, passwords, database secret keys and unpublished media.
- Require a real authenticated user before creating owner-scoped application content.
- Use an ordinary publishable client key with RLS for client operations; never expose service-role credentials to browsers or public prompts.
- Do not change the universal execution master or specialist studio source rules when modifying database implementation.
- Retrieve actual source/asset IDs and verified approvals; never invent continuity or infer generated assets from descriptions.
- Check every action's result and preserve successful records when another action fails.
- Schema changes belong in an auditable migration and must be checked afterward.

## Next implementation step

Enable GitHub Pages, configure Supabase Auth Site URL and Redirect URLs, and run the first genuine user acceptance test: sign in, create project, save/reopen a source version, approve it, upload/download a private file and verify persistence. Also test that a second account cannot access the first account's data. The first browser application and public-only configuration service are now implemented; real-user operation has not yet been verified.
