# CBTeD atomic media quality-gate and correction ledger

## Why this exists
The Awake Reprise session exposed repeatable procedural failures: unrequested multi-panel generations; delivering contact sheets instead of independent frames; images missing exact character references; hair/beard/face drift; repeated near-identical poses; title lettering leaking into non-title frames; switching providers without consent; signed asset URLs expiring; overlong image-to-video prompts containing future story context; claims that queued assets were finished; and retries that reproduced the same failure.

These are failure categories, **not** permanent rules about any artist's appearance, genre or aesthetic. Character details and private photographs remain project-scoped; never commit private reference bytes to the public repository.

## Contract
- Every image job describes exactly **one** scene, output count **1**, presentation `individual`; every independently requested image is a distinct job. Planning a set is allowed, generating a collage as a substitute is not.
- Every job names required private character asset IDs and **every call** supplies the approved references as actual attachments with provider/adapter evidence. An unavailable reference is a preflight stop, not permission to replace it with a generic person.
- Every job names the selected provider. A change requires explicit user approval; a server-side policy cannot control native ChatGPT/third-party tools that were not submitted through CBTeD.
- `text_policy: none` on ordinary frames. A thumbnail uses `text_policy: title` and exact `title_lines`. The previous title image is not a general reference for later frames.
- Video frame images have explicit roles: real start/end controls only when supported; intervening images are guidance unless requested as cuts. Motion prompts describe **only** the requested scene and movements, including orbit/lens and actor action, without future-plot exposition.
- Provider task submission and successful generation are different states. A finished image/video must be opened; verify aspect ratio, unique composition, text, panel count, person identity, and delivered file.
- A panel collage should be split into **individually named files** for diagnosis when appropriate, with crop provenance and pixel dimensions. Tiles are not misrepresented as natively generated full-resolution masters. If below the requested resolution or visually wrong, regenerate the specific image as one frame.
- The verifier must record structured `quality_evidence`, including actual asset inspection. `needs_review` blocks passing/delivering. This is a deterministic evidence gate, **not** an automatic computer-vision system: the image/face checks must be conducted by a real capable inspector or the creator.
- Record attempt signature and failure reason. An identical failed spec cannot repeat without a changed input/method or explicit user approval. Keep earlier successful assets and never burn extra credits silently.

## API shape and rollout
The shared code lives in `supabase/functions/_shared/quality-gate.mjs`, imported by `cbted-media-gate`.
A version 1 `quality` object is required for production-run-linked image/video jobs and for requests explicitly enabling the gate. The compatibility path for older unlinked/manual jobs remains until caller migration; `CBTED_VISUAL_QA_REQUIRED=true` makes every image/video job strict. This avoids breaking a pre-existing published Lovable interface while the UI is wired.

Example (IDs are opaque examples, not user data):
```json
{
  "version": 1,
  "scene_id": "image-02",
  "scene_count": 1,
  "output_count": 1,
  "presentation": "individual",
  "requested_provider": "chatgpt",
  "selected_provider": "chatgpt",
  "text_policy": "none",
  "required_character_asset_ids": ["<approved-private-asset-id>"],
  "attached_character_asset_ids": ["<approved-private-asset-id>"],
  "reference_attachment_receipt": "<verified-provider-or-adapter-receipt>"
}
```

Every `verify` pass for a gated job requires a separate `quality_evidence` report: `artifact_opened=true`, `output_count=1`, `panel_count=1`, `aspect_ratio_matches=true`, `identity_approved=true` (when characters), `references_actually_attached=true`, `has_unwanted_text=false` for non-title scenes, `composition_distinct=true`, `single_asset_delivered=true`, and `continuous_camera_verified=true` for an unbroken video shot. These fields must represent **actual** inspection findings.

## Lessons vs identities
The universal rulebook and tests embody reusable process protections. Project-specific corrections (exact face, approved portrait, wardrobe, banned features, title words) belong in private `project_rules` and `assets` and must be retrieved/checked for each scene. This does not retrain the base image or language model; it provides persistent, testable boundaries for CBTeD-managed execution.

## Status honesty
A GitHub code commit alone does not prove Supabase deployment, UI integration or a passing QA test. Report each separately. Likewise, an accepted Runway or other provider task does not mean that the final media has passed visual inspection.
