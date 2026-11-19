# CBTeD media generation: connected ChatGPT, Runway and Higgsfield

## Working implementation

Current CBTeD project controller has a generator selector, creation form and per-job credit approvals. The existing CBTeD MCP plugin exposes: `cbted_media_prepare`, `cbted_media_jobs`, `cbted_media_quote`, `cbted_media_approve`, `cbted_media_claim`, `cbted_media_reference`, `cbted_media_submitted`, `cbted_media_import` and `cbted_media_verify`.

The real generation is done by **connected ChatGPT tools** (native GPT image, Runway image/video, Higgsfield image/video), not by the Supabase gateway impersonating them. The backend stores requests, checks credits, records explicit approvals, enforces one-time claim, and saves actual approved provider files when a trusted URL is available.

### Image/video provider routing

| Choice | Generation tool | Credit check |
| --- | --- | --- |
| ChatGPT native GPT image | `image_gen` | ChatGPT subscription/tool limits; no additional Runway/Higgsfield credits |
| Runway image | `Runway.generate_image` | `Runway.whoami` plan credits, real price if available |
| Runway video | `Runway.generate_video` | `Runway.whoami` plan credits, actual quoted cost where available |
| Higgsfield image | `Higgsfield.generate_image` | `Higgsfield.balance` plus `Higgsfield.estimate_image_cost` |
| Higgsfield video | `Higgsfield.generate_video` | `Higgsfield.balance` plus `Higgsfield.estimate_video_cost` |

**GPT Image hosted by Runway or Higgsfield consumes that provider's credits** and must use that provider's quote/approval gate. Native ChatGPT images may be generated within the chat, but are not considered a saved project asset until their actual bytes are uploaded and checked.

### Credit safeguards

- Plan-included monthly credits are distinct from purchased/extra credits. `Runway.whoami.credits.plan` is included, and `credits.purchased` is not.
- Higgsfield's reported total credits do not identify their origin. Without an independently identified monthly-included portion, paid generation asks for approval.
- For each exact model, prompt, settings, duration and source image, prepare a job, get an actual quote and included balance observation. Unknown cost/allowance blocks or asks for an exact quote; nothing automatically spends unknown credits.
- When a current, observed included allowance is sufficient, the media job can proceed without **additional credit** consent; existing creative approval stages remain in force as configured.
- Otherwise CBTeD shows `Approve N credits` / `Reject` inside the selected project. Never use `cbted_media_approve` unless the project owner explicitly approves that precise quote. A changed quote invalidates prior approval.
- `cbted_media_claim` uses a transactional SQL function, row locks and per-owner/provider advisory locking; new in-flight jobs must not double-allocate the same observed allowance.
- No project service purchases, tops up, or bills a credit card. Provider-side retries are never authorised by a previous job's approval. Project approvals cannot override provider-level payment, subscription or platform permissions.

**Trust limitation:** Plugin balance and quote observations are returned by the user's connected tools and relayed to CBTeD. Supabase cannot cryptographically verify a user's separate provider plugin session. Never treat arbitrary browser-entered numbers as proof of included credits. The default for unknown or unverified values is to require approval. Out-of-band provider usage may change available credits between checking and submission; a fresh check is required.

### Real assets and hand-off

- `cbted_media_reference` signs a saved, project-owned reference image for fifteen minutes; this URL can be used as an actual first frame in a connected provider tool. The permission is limited to that image.
- After the connected provider returns an actual task id, `cbted_media_submitted` records the id. A task id is NOT a completed video.
- Once the provider returns a real HTTPS media URL, `cbted_media_import` accepts only an admin-allowlisted host, blocks redirects and unsupported file signatures, applies byte limits, and saves the real file to the existing private Supabase asset store. It then awaits creative inspection.
- `cbted_media_verify` records an inspected result, or failure for repair. A generated prompt or returned thumbnail never counts as verified video.
- Native ChatGPT images need an upload into CBTeD project files (or another verified import method) before the persistent handoff is complete. Do not invent that feature.

### Service configuration

The current public front end is `app/production.html`. The new backend gateway is `supabase/functions/cbted-media-gate`, with `verify_jwt=false` because its handler authenticates the user's Supabase JWT on every private action.

The private backend setting `CBTED_MEDIA_ALLOWED_HOSTS` is a comma-separated **exact list of trusted provider output hosts** allowed to be downloaded to private project storage. Keep it limited to actual returned media domains. For example, some observed Runway media were served from a specific CloudFront hostname; do **not** allow the entire `cloudfront.net` domain or accept an arbitrary internet URL. Each newly observed Higgsfield media host must be verified before adding it to the list. If this setting isn't configured, asset import intentionally refuses to run.

The account owner must have installed and authenticated Runway/Higgsfield plugins in ChatGPT to use those external actions. Those connections are user-scoped and are not universal credentials shared with every future CBTeD user. An external backend-only unattended generation worker would need separately approved provider access/credentials and is not implied by installing a ChatGPT plugin.

### Verification and production acceptance

- Regression tests cover provider dispatch, monthly included/purchased distinction, stale/unknown quotes, double-spend reservations, owner isolation and incorrect approval amounts.
- A real end-to-end acceptance test needs a **specific user-approved credit spend** when purchased credits would be used, then an actual generation, task status, private import and visual inspection.
- The media generator remains safe to deploy before any paid task has been approved: no paid generation is triggered by its own backend.
