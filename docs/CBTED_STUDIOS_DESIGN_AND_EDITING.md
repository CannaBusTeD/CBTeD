# CBTeD StudioS: minimal Ted World design and editorial controls

## Product identity
Use **CBTeD StudioS** exactly, including the capital final **S**, in all user-visible labels. Keep repository names, OAuth resource IDs, database functions and published existing asset names unchanged where renaming would break clients.

## Studio entry, navigation and connections

Build and review changes in GitHub. The Studio frontend lives in CannaBusTeD/inclusive-video-chorus. This repository owns the shared product instructions and canonical backend. A Studio change request does not authorise spending Lovable builder credits. Run that builder only at the owner's explicit request.

The welcome page says “Welcome to CBTeD StudioS” and offers “Sign in” and “Sign up”. Use the canonical Studio identity once and restore it across refreshes, project links and department changes. Keep legacy publishing records owner-scoped. An external service may require its own connection under Links. A temporary service failure should offer a retry and preserve the existing session.

After entry explain that Studio brings creative tools together on the same project. Projects, Creative Studio and Links are easy to find. Creative Studio has exactly four departments, in order: Ideas, Writing, Image, Video. Each opens directly and is also accessible within a project. Ideas opens a conversation about what the creator wants to make, before project selection. The optional idea-through-publish workflow can carry work between departments. Keep music, review and publishing actions reachable in context.

Links gathers the creator's website, AI assistants including Muse, Claude and ChatGPT, generation tools and social accounts. “Link socials” opens social connection controls. Use real provider authorisation where available and “Coming later” for unwired integrations. Show an existing connection without repeating setup. At the very bottom of each department place one optional link to its corresponding section: “Link idea tools”, “Link writing tools”, “Link image tools” or “Link video tools”. Support keyboard and screen-reader navigation back to the work.

Perform health checks quietly. Surface a specific problem and next action only when it affects what the creator is doing. Check keyboard order, heading focus, accessible names and the actual destinations, including the return after linking.

## Design brief (public-facing guidance only)
A restrained modern-gothic theatre world: faded crimson velvet, torn but subtle wallpaper, weathered stage brass, soot, aged parchment, and small accents of decay. A contemporary working studio inside Ted World, **not** a decorative haunted-house landing page.

Palette, from the public look-and-links chapter of the creative identity:
- Soot `#190F0C`
- Oxblood `#901211`
- Ember `#DD4115`
- Sepia `#D2B285`
- Parchment `#E6CDA5`
- Cream `#E3CDB1`

Type hierarchy: Cormorant Garamond for headings, Caveat sparingly for handwritten cues, JetBrains Mono for timecodes, technical IDs and versions; keep a clear high-legibility font for regular interface text. Not every label needs a decorative font.

Use light, optional wallpaper grain behind *solid readable panels*. Never bake actual wording into a wallpaper image. No animated curtain that blocks controls. High contrast and screen-reader semantics always override aesthetics. All interactions must be keyboard-reachable, sizeable and labelled. Respect reduced-motion settings. Existing artist / CBTeD logos remain unmodified.

This document contains no private appendix material or hidden-site URLs. Do **not** copy private biography appendices into GitHub, public site, analytics, model instructions or fixtures.

## Stage ownership, edits and automation
Every stage (idea, writing/lyrics, Suno prompt, song/audio, storyboard, images, animation, video assembly, final QA, publishing) must show:
- Verified source version, approved result and current status.
- **Edit / Request changes** and a text field for the user's correction.
- View previous revision and compare when real versions exist.
- No destructive edits to approved artifacts: every user override is an immutable request, then a new version is produced against that exact prior version.
- Existing approved work remains untouched until a validated successor is explicitly made current.
- A local repair never restarts completed unrelated stages, and completed revisions cannot be dispatched twice.

Canonical Supabase migration `20261121212243_cbted_editorial_override_requests.sql` introduced:
- `public.cbted_editorial_overrides` (owner-scoped, append-only requests)
- `public.cbted_request_editorial_override(p_project,p_kind,p_instructions,p_run,p_step,p_source_version,p_replacement_text,p_request_key)`
- `public.cbted_cancel_editorial_override(p_override)`

Submitting a request does NOT claim the revision was generated, reviewed, merged or made live. That still requires a connected authenticated backend executor and real QA evidence. The UI should display **Requested** until actual work is performed and verified.

## Autonomous execution versus publication
For verified agents and tools, normal internal editorial passes should advance automatically once two genuinely distinct QA reviewers agree on the **actual** correct version. The creator can pause, intervene and request a correction at any point. No unnecessary human approval clicks for internal creative judgments.

Paid generation needs an authorised budget (or a narrow user approval); do not silently substitute low-quality alternatives, spend unbounded credits or retry indefinitely. Publishing may run automatically only under a previously granted, explicit permission for the relevant accounts, content scope and allowed time. Without such permission, the final work is **publication-ready** but is **not published**. No agent's internal approval may impersonate user authorisation to publish.

## Honest deployment statuses
A staged design mock-up is not a deployed provider integration. A review agent reporting PASS without examining the actual output is not independent quality control. A saved story or render job is not a finished video. Display why a missing tool/permission blocks progress, never silently mark the project complete.

These rules extend, but do not replace, the existing canonical Supabase orchestration and the public CBTeD StudioS integration contract.
