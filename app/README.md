# CBTeD Project Manager

Status: **CBTeD project manager v2 committed**. The user has already confirmed successful website sign-in and real project creation; the new five-workspace UI and its saved Visual/Animation forms still require live authenticated browser acceptance testing. Private user content stays in Supabase.

## Purpose

This minimal accessible interface connects the existing ten-table CBTeD database and private storage bucket to user authentication and a shared project workspace.

It supports:

- Email/password sign-up, sign-in, persistent session and sign-out via Supabase Auth.
- Accessible, mobile-friendly confirmation dialog after sign-up without a session, with instructions to check inbox/spam and confirm the email; the same dialog distinguishes an existing unconfirmed account from Supabase's short security cooldown. It never promises that a rate-limited request succeeded.
- Creating and switching between private owner-scoped projects.
- Creating source documents, saving separate numbered text versions, and reopening specific versions without overwriting earlier text.
- Writing fields explicitly labelled **Song title**, **My current lyrics**, **My ideas**, and **Suggested lyrics / alternative lines**, with helpful example text inside each box. Labels change appropriately for poems, stories, scripts, treatments and notes.
- Each saved writing version stores the current text, personal ideas and proposed alternatives in separate columns. Users can save an ideas-only version before drafting any lyrics; suggested alternatives never overwrite the current writing.
- Explicit source-version approvals (append-only decisions).
- Storing versioned project-specific rules, corrections and decisions, with studio scope.
- Uploading private project assets under unique paths and downloading them with the signed-in user's session.
- Creating writing/visual/animation task records with requested output counts.
- Recording source-grounded Writing → Visual handoffs after approval.
- Reading stored source, assets, tasks and handoffs across sessions.

It does **not** yet run the three creative studio agents or image/video tools. Handoffs and tasks are durable records, not proof that an external generation has occurred.

## CBTeD Studios branding

The artist's approved circular CBTeD emblem is installed as the website header mark and favicon in `app/assets/cbted-emblem.webp`. The site's interface now uses the approved ruby-red, gunmetal and red-velvet palette, with high-contrast controls and accessibility-aware keyboard focus. The source design is documented in `design/Branding.md`.

The website icon is a small transparent WebP optimisation of the user-supplied original, not a newly generated substitute or the full-resolution master. The word "STUDIOS" in the header is accessible styled text. User drafts and private assets remain in Supabase, never in public GitHub.

## CBTeD v2: studio pages and GO

The user chooses a single page with **Which studio would you like to work in?**

1. **Project setup**: project title/description, versioned rules, uploaded private files; Save Project Details is placed at the bottom of the full page. Rules and file uploads have their own explicit Save/Upload controls.
2. **Writing Studio**: exact current lyrics/writing, personal ideas, suggested alternatives, saved draft versions and explicit approval. Save Writing Draft is at the bottom.
3. **Visual Studio**: image purpose, exact source moment, separate image count, ratio, style/world, characters, composition, continuity, restrictions, assigned character/style/location/object image references and exact thumbnail text. Save Visual Setup creates an **append-only version** in `public.studio_settings`.
4. **Animation Studio**: optional approved writing, uploaded start image, clip count, duration, ratio, desired motion, camera movement, atmosphere, audio, continuity and preferred generation service. Save Animation Setup creates another append-only setup version.
5. **GO / Production**: choose one or more saved studios, validate that their settings have been saved, and prepare an immutable project/run snapshot. A single authenticated SQL transaction (`public.prepare_project_run`) creates the `project_runs` row and one **blocked** task per selected studio; those tasks have zero completed outputs. The user may download the real JSON production brief. GO is at the bottom of the page.

**Important limitations:** GO **does not generate** lyrics, images or videos. It executes the preproduction recording workflow only. The actual creative providers and studio orchestration tools are not yet connected to the public website; no image/video output will be labelled completed without a real provider result. Selecting a provider name in Animation Studio saves a preference, **not** a connected account.

Unsaved changes to selected studio settings, writing drafts or project details prevent GO from silently using older versions. A previously approved writing version can be selected explicitly for Visual and Animation; the project also supports independent visual and animation concepts when source text isn't needed.

The app has been updated with source checks for the five pages, form controls, installed emblem and GO RPC integration. Database verification included a rollback-only authenticated transaction that created one production run and its task; the test records were rolled back (no dummy work remains). A second simulated identity returned zero readable projects.

## Technical architecture

- Static, accessible HTML/CSS/JavaScript front end: `app/`.
- Pinned Supabase browser SDK: `@supabase/supabase-js@2.118.0` via ESM CDN.
- Live database: dedicated Supabase project **CBTeD**.
- Storage: private `cbted-project-assets` bucket; its policies require authenticated ownership of the project.
- Browser API configuration: a deployed **public-only** Supabase Edge Function named `cbted-public-config`. It returns the project's URL, private bucket ID and **publishable** (not secret) key.
- No password, secret key, service-role key, unpublished writing, photographs or private project content is committed to the public repository.
- Deployment: `.github/workflows/deploy-cbted-manager.yml` publishes the `app/` directory to GitHub Pages. The repository owner must first enable GitHub Pages with **Source: GitHub Actions**, if not already enabled.
- Source checks run before Pages deployment: JavaScript syntax, DOM wiring/accessibility checks (`tests/check-project-manager.mjs`), and signup/cooldown message tests (`tests/check-auth-notices.mjs`).

## One-time setup before sign-in can be tested

### 1. Enable GitHub Pages

In GitHub, open **CannaBusTeD/CBTeD → Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.

After the workflow succeeds, the expected site address is:

`https://cannabusted.github.io/CBTeD/`

This is an expected address, not a promise that Pages is already enabled or the deployment has completed. Check the repository Actions page and the deployed URL.

### 2. Set allowed authentication URLs

In **Supabase → CBTeD → Authentication → URL Configuration**:

- Set **Site URL** to the actual published GitHub Pages address.
- Add that exact URL to **Redirect URLs** (with a suitable trailing-slash path pattern if required).

Without the correct URL settings, the email confirmation link may redirect somewhere unrelated. Email confirmation is normally enabled for hosted Supabase Auth projects.

### 3. Create a CBTeD application account

In the published app, create an account using an email address and a new strong password. This user account is **separate** from the Supabase dashboard owner's account and from the project's PostgreSQL database password. Follow the email confirmation link, return to the app and sign in.

Never share the account password in a chat, GitHub, a front-end file, or a screenshot.

## First real user acceptance test (updated for v2)

With a signed-in browser session:

1. Create a private project and reopen it.
2. Create a song with a clear **Song title** and text in **My ideas** only; save Version 1. Add **My current lyrics** and **Suggested lyrics**, save Version 2, then switch back to Version 1 to confirm that each of the three boxes restores its original contents.
3. Approve a version and create the source's Writing → Visual handoff. Confirm the approved source version and handoff records persist.
4. Save one project-specific correction and confirm it appears in the current rules list.
5. Upload a small image or text file; download it again from the file list.
6. Create a studio task; sign out and sign in again; verify that all earlier records remain.
7. Use a second distinct account to verify it **cannot** list, read, update, or download the first account's project records and files.

Before these real sign-in and cross-account tests pass, do not claim that the end-to-end app or isolation is fully validated.

## File and project safety

- Each upload path follows `<authenticated-user-id>/<owned-project-id>/<category>/<unique-name>`.
- Categories are `writing`, `references`, `images`, `videos`, `audio`, `exports`, `other`.
- Storage policies currently allow authenticated owner-scoped **INSERT** and **SELECT**, not update/delete; every new version gets a unique file path.
- User content is private in Supabase; the hosted HTML/JS is necessarily public on GitHub Pages.
- The client uses only a publishable key with Supabase row-level security. It never has elevated database access.
- File size and storage availability still depend on the Supabase subscription and current platform limits.
- Browser tab and network failures can interrupt file uploads. A file might upload before its metadata insert fails; the app reports the private path in that case.
- Document version-number collisions under simultaneous editing may require a future atomic server-side version service.

## Known missing capabilities

- A deployed three-studio coordinator/MCP server invoking actual writing, image or video providers.
- Real artist/character reference-role selectors and specialist studio controls.
- Project collaboration/team memberships; v1 project permissions are single-owner.
- Asset transforms, thumbnails, resumable large-video uploads, background task queue and retry orchestration.
- Access-control tests with real independent user accounts.
- Automated live-browser tests and verified GitHub Pages publication.

## Useful source paths

- `core/Master_Workflow_Rules_Universal_Creative_Execution.txt`
- `core/CBTeD_Core.md`
- `core/Shared_Project_Database.md`
- `writing/Writing_Studio_Operating_Procedure.md`
- `visual/Visual_Studio_Operating_Procedure.md`
- `animation/Animation_Studio.md`
- `supabase/functions/cbted-public-config/index.ts`

CBTeD source work should continue sequentially, preserving existing user rules and approved source material. Never claim a workflow is complete when only its plan or task record exists.
