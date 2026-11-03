# CBTeD

CBTeD is a source-first creative production system, with three independent but interconnected specialist studios: **Writing**, **Visual**, and **Animation**.

## Current implementation status

CBTeD's **rules and operating procedures** are stored here. The original universal workflow remains the authoritative execution discipline, independent of each studio's specialist creative rules.

### Studio instructions
- `core/Master_Workflow_Rules_Universal_Creative_Execution.txt` — full universal operating protocol.
- `core/CBTeD_Core.md` — shared rules, state and handoff contract.
- `writing/` — master writing prompts, Writing Studio, and detailed operating procedure.
- `visual/` — image-generation workflow, Visual Studio, and detailed operating procedure.
- `animation/` — universal image-to-video motion prompting, Animation Studio, and its operating procedure.

### Working backend foundation
- Dedicated Supabase project **CBTeD** (separate from the repository).
- Ten project database tables for projects, source versions, project rules, assets, tasks, outputs, approvals, handoffs and events.
- Authenticated owner-only row-level security for project records.
- Private `cbted-project-assets` bucket with owner/project-scoped read and upload policies.
- `cbted-public-config` Edge Function deployed; it serves **only public browser configuration**, never database secrets.
- `core/Shared_Project_Database.md` documents the deployed schema and storage policies.

### CBTeD Studios project manager (v2)

- `app/index.html`, `app/styles.css`, `app/app.js` implement a keyboard/screen-reader-friendly project manager.
- Supports Supabase email/password signup and sign-in, project creation, versioned writing, explicit approvals, project-specific rules, private file uploads/downloads, task records, and a Writing-to-Visual handoff record.
- A single accessible drop-down now switches among five pages: Project Setup, Writing, Visual, Animation and GO.
- Each page has a clearly labelled Save control at its bottom. Visual and Animation settings are stored as separate append-only versions in Supabase; existing writing versions are preserved.
- GO validates saved settings, prepares a real immutable production brief, and atomically records blocked work tasks via `prepare_project_run`. It can export the brief as JSON. Actual generation providers are **not yet connected** and are not falsely represented as having run.
- The approved CBTeD emblem and ruby/gunmetal/velvet visual identity are integrated throughout.
- `.github/workflows/deploy-cbted-manager.yml` is a GitHub Pages deployment workflow with static checks.
- `app/README.md` explains setup, security, known limitations and the first authenticated user test.

**Important:** the user has confirmed that the GitHub Pages website is live and that account sign-in and project creation work. The new five-page interface and production-run UI have been committed and the database operation passed a rollback-only authenticated test, but the latest Pages deployment and a full user-driven image/video-provider run are **not** independently verified. Auth redirect settings have been configured.

A saved handoff or task is a record, **not** evidence that an image or video has been generated. Actual creative tools, the public plugin interface, and a three-studio execution coordinator remain to be integrated.

## Development principles

- The master workflow is never compressed, silently bypassed or replaced.
- Project-specific sources, user corrections and approved output versions are authoritative.
- Each requested generation or action is individually checked and tracked.
- Successful work is preserved when a later operation fails.
- Private user content belongs in authenticated private storage, **not** public GitHub.
- Do not claim features have been deployed or tested without actual evidence.

## Next action

Enable and verify GitHub Pages publication of the project manager, configure Supabase Auth redirect URLs, and perform the first real-user end-to-end sign-in and project/file tests. After that, connect the studio execution tools and shared-project coordinator.
