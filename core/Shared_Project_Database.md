# CBTeD Shared Project Database

Status: **Initial database schema deployed**. This document describes the current state of the dedicated CBTeD Supabase development project. It is not a claim that the studios are connected to an application or that asset storage is configured.

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
- Supabase security advisors reported **zero lints** immediately after deployment.

## Database tables

| Table | Responsibility | Relationships and protections |
| --- | --- | --- |
| `projects` | Project identity, owner, title, description, active/archive status, current studio | `owner_id` references `auth.users.id`; only owner may read, create or update |
| `sources` | Logical writing/source document and its type | Belongs to a project; can have many source versions |
| `source_versions` | Immutable draft/approved-source candidates, version number, text or private storage path and previous-version reference | Belongs to a source in the *same project*; unique source/version number |
| `project_rules` | Versioned project rules, corrections, decisions, preferences and continuity constraints | Scope may be project/writing/visual/animation; revision numbers, supersession links, locked flag |
| `assets` | Metadata and private storage paths for uploaded references and generated files | Role, dimensions, duration, MIME type, linked source version; actual files not yet provisioned |
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
4. Reference or output **file metadata** lives in `assets`. Actual images, audio and video require a private storage bucket and upload permissions as a separate implementation step.
5. Each studio operation gets a `tasks` record with the next step and required output count.
6. Completed attempts are written to `outputs`, with verification state.
7. User approval is recorded in `approvals`; the receiving studio checks approved source and assets rather than trusting a summary.
8. `handoffs` connects independent studios while leaving source and prior results intact.
9. `activity_events` records significant actions for traceability.

## What is **not** implemented yet

- Supabase Storage private bucket, upload/download permissions, or actual file uploads.
- Sign-in UI, account onboarding or working application sessions.
- A CBTeD API/MCP server that reads/writes these tables and invokes generation providers.
- Application-side approval checks, latest-revision selection, automated workflow advancement and state transitions.
- Integration of the three studio instruction contracts with the live database.
- A user interface or deployed public CBTeD plugin.
- Live owner/other-user RLS interaction tests; the current verification was schema/policy/grant inspection plus Supabase security advisors.

Do not claim any of those capabilities have been delivered just because the schema exists.

## Security and workflow invariants

- Keep the public GitHub repository free of private user content, passwords, database secret keys and unpublished media.
- Require a real authenticated user before creating owner-scoped application content.
- Use an ordinary publishable client key with RLS for client operations; never expose service-role credentials to browsers or public prompts.
- Do not change the universal execution master or specialist studio source rules when modifying database implementation.
- Retrieve actual source/asset IDs and verified approvals; never invent continuity or infer generated assets from descriptions.
- Check every action's result and preserve successful records when another action fails.
- Schema changes belong in an auditable migration and must be checked afterward.

## Next implementation step

Create **private project asset storage** and safe ownership-scoped upload/read policies, then connect a minimally functional project manager that can create a project, save a source version and retrieve it as the same authenticated user.
