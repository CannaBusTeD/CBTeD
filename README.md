# CBTeD

CBTeD is a source-first creative production system, with Writing, Visual, Audio and Animation specialist agent groups managed by one controlled production coordinator. The original Writing, Visual and Animation studio instructions remain authoritative.

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

### Connected CBTeD MCP and central production orchestrator

- The existing `cbted-mcp` Supabase Edge Function was deployed as version 4, with seven added production-management tools alongside its original thirteen. The connected CBTeD plugin successfully returned the full master rulebook **and actual authenticated project records**; plugin tool manifests may need refreshing to reveal the new functions.
- The new `cbted-orchestrator` Edge Function is deployed. It offers deterministic, project-owned planning and separate authorised stage execution.
- PostgreSQL tables `production_runs`, `production_steps` and `production_approvals` persist the production plan, specialist work and explicit approvals. Additive migrations have been applied, including a check for **real private Storage objects**, not merely asset metadata, before media stages can pass.
- The controller defines **23 specialist agent roles** for writing, language-pattern review, image design, audio and video. Only controlled backend text/image adapters are currently implemented; no working audio/video provider or final editor has been verified.
- Planning never authorises generation. Paid backend execution is disabled unless API credentials, model choices, an explicit enable flag and a per-run operation cap are all configured.
- GitHub contains the canonical source and CI workflows. GitHub-to-Supabase automatic deployment additionally needs `SUPABASE_ACCESS_TOKEN` configured in GitHub Actions.
- See [orchestration architecture and verification](docs/ORCHESTRATION.md) and [MCP integration](mcp/README.md).

### New song editorial quality gate

- `writing/Lyric_Post_Draft_Editorial_Gate.md` defines the mandatory post-draft critique, recommendations, and rewrite as three distinct stages for CBTeD-authored new songs.
- For song-plus-thumbnail requests, submit the thumbnail when the song concept is established, then execute the three editorial stages while the image processes. Final proofreading and image-to-revised-lyric alignment checks must precede delivery.
- The original universal master rules are **unchanged**; this is additional song-specific operating discipline.
- The original CBTeD plugin package version 0.6.3 adds the lyric-editorial-gate skill while retaining its identity, original instructions, images, and MCP configuration.

### CBTeD Studios project manager (v2)

- `app/index.html`, `app/styles.css`, `app/app.js` implement a keyboard/screen-reader-friendly project manager.
- Supports Supabase email/password signup and sign-in, project creation, versioned writing, explicit approvals, project-specific rules, private file uploads/downloads, task records, and a Writing-to-Visual handoff record.
- A single accessible drop-down now switches among five pages: Project Setup, Writing, Visual, Animation and GO.
- Each page has a clearly labelled Save control at its bottom. Visual and Animation settings are stored as separate append-only versions in Supabase; existing writing versions are preserved.
- GO validates saved settings and records a preproduction brief via `prepare_project_run`. Separately, `app/production.html` and `app/production.js` add a production controller to preview ordered agent stages, register runs, inspect status, approve or revoke media operations and execute one permitted stage. Neither GO nor production registration is evidence of generated media.
- The approved CBTeD emblem and ruby/gunmetal/velvet visual identity are integrated throughout.
- `.github/workflows/deploy-cbted-manager.yml` is a GitHub Pages deployment workflow with static checks.
- `app/README.md` explains setup, security, known limitations and the first authenticated user test.

**Important:** existing GitHub Pages sign-in and project creation were previously confirmed. The separate Production Controller page is on the feature branch until merged and published; do not claim that the new page has passed live browser acceptance tests. The connected MCP authenticated-project-list check succeeded, and the Supabase database changes were applied. No charged model output or complete music-video generation has been verified.

A saved handoff or task is a record, **not** evidence that an image or video has been generated. The ChatGPT-native MCP backend is connected and its authenticated read works, but the seven newly added actions may require a plugin refresh. Do not confuse deployed orchestration code with end-to-end generation verification.

## Development principles

- The master workflow is never compressed, silently bypassed or replaced.
- Project-specific sources, user corrections and approved output versions are authoritative.
- Each requested generation or action is individually checked and tracked.
- Successful work is preserved when a later operation fails.
- Private user content belongs in authenticated private storage, **not** public GitHub.
- Do not claim features have been deployed or tested without actual evidence.

## Next action

After CI passes, merge the orchestration feature branch and verify the new GitHub Pages UI. Configure the GitHub Actions deployment credential, refresh the CBTeD plugin tool manifest if needed, then perform an authenticated disposable-project end-to-end test. Connect real paid model APIs only after explicit cost and provider review. Audio/video and final assembly remain future integrations.
