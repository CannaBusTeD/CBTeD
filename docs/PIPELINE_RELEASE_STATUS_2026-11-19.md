# CBTeD end-to-end pipeline: implementation checkpoint (19 November 2026)

This document distinguishes **deployed and tested source code**, **real creative execution**, and **external integrations still awaiting owner or platform authorisation**. A green deployment never means a song, video or public post was created.

## Connected canonical branches

- `writing`, `visual`, `animation`, `song_video`, `idea_to_publish` remain unchanged.
- `audio`: independent music/narration without forced earlier writing, images or video.
- `animation_publish`: text-to-video or user-provided source video followed by release audit and proposed publishing; avoids unwanted writing/images/music stages.
- `song_video_publish`: song writing, images, real audio stages, video, assembly, release audit and publishing.
- `idea_to_publish_audio`: initial idea/critique/refinement, writing, images, Suno-compatible audio, video, assembly and publishing.

All branch graphs are encoded in both `supabase/functions/_shared/production.mjs` and the database's `cbted_canonical_plan`. The live database now accepts these additional workflows without deleting any earlier project or relaxing per-stage approval constraints. The `publish_send` stage intentionally remains blocked until a real verified publisher exists.

## Media generation and handoffs

- Native ChatGPT GPT images; Runway image/video/music/voice tools; Higgsfield image/video/audio tools; Suno music; ElevenLabs speech are routed as **user-scoped connected ChatGPT tools**.
- Supabase does not inherit other plugins' credentials and cannot autonomously call these providers merely because the creator installed the plugin.
- `cbted-media-gate` registers owner-scoped image/video/audio jobs, exact credit quotes, explicit approval/rejection and one-use claims. Generated image/video/audio files can be imported from explicitly approved provider media hosts, verified against expected file signatures, and saved privately.
- A saved project-owned image, audio or video can be retrieved using a short-lived signed project reference URL.
- Jobs bound to a real `run_id` and `step_key` can proceed only after that production step is explicitly claimed. `cbted_finish_media_generation` atomically marks the reviewed real media and its linked stage, or rejects the operation. Its result does not establish external provider authenticity unless a real provider task and file were separately verified.

## Actual video/audio assembly

`scripts/assemble_project.py` is a working FFmpeg renderer for ordered local video clips, existing clip sound, optional music, narration, optional SRT subtitles, selected frame sizes and standard MP4 export. It probes real input files and verifies output duration, media streams and SHA-256. A synthetic two-clip/video-plus-music render and path-escape test passed in the connected Higgsfield media sandbox on 19 November 2026. GitHub runners without FFmpeg run Python syntax checks and report the missing binary; that skip is not represented as an end-to-end rendering test.

An actual project can use `cbted_media_reference` per saved source asset, download those signed sources into the connected media sandbox, run the assembler, inspect the output, then upload/import the final MP4 to the CBTeD project. **The fully automatic sandbox-download → assemble → project-upload cycle has not yet been proven with a real user project.** Do not claim a video is finished solely because the assembler script exists.

## Publishing

The project controller now allows choosing a real saved video and a previously authorised social destination, drafting platform-specific captions, setting privacy or scheduling preferences, and approving/rejecting the exact draft. The separate account-linking screen remains available for official OAuth provider login. Expired account credentials are treated as expired, and new draft requests cannot use them.

Publishing is **not live**. Each platform app requires its own approved connection, token renewal/revocation, real media upload adapter, schedule queue and delivery verification. The publishing endpoint remains fail-closed until those provider-specific controls are implemented and tested. Draft approval is not a published post.

## Credit safeguards and current limitations

- ChatGPT native image creation has no external Runway or Higgsfield credit debit.
- Runway distinguishes monthly `plan` credits from `purchased` credits; Higgsfield balance does not confirm the monthly portion. Purchased credits must not be treated as included.
- A signed-in client can declare a quote, but the controller now **rejects that client's claim that the included balance is provider-verified**. Until a server-verifiable provider receipt is implemented, external generation cannot silently auto-run using a claimed monthly allowance.
- Exact quoted spend requires a project approval; a user may approve the requested provider/model/job/credit maximum. Generations with unknown exact cost are blocked. Provider tools still enforce their own real costs; CBTeD cannot magically limit spending by an independently connected provider if a different action is invoked outside CBTeD.
- A full trusted quote/balance source with provider-bound signed receipts, reconciliation and overage detection remains an external integration requirement.

## Remaining external or operational blockers

1. Actual real-world Suno → audio asset → video assembly test, and sound/voice synchronisation.
2. Real Runway/Higgsfield generation with explicitly authorised credits and verified returned task files.
3. Autonomous hand-off inside a supported agent session; unattended Supabase → other user's plugin calls are not supported. Provider-native backend APIs require separate credentials, if unattended runs are required.
4. Whitelisting actual CDN output hosts using private `CBTED_MEDIA_ALLOWED_HOSTS`, or a secure provider-specific upload method; leave unknown hosts blocked.
5. Native GPT image output to private project storage without manual reupload.
6. Secure complete social publishing adapters and external platform app approval; real queued/scheduled posting and final public URLs.
7. End-to-end signed-in acceptance run, automated media inspection/quality revision, recovery from stalled provider jobs, and asynchronous job notifications.
8. Security settings: leaked-password protection and the external database linter recommendations should be reviewed before a public multi-user launch. Existing intentionally RLS-closed credential tables are not automatically vulnerabilities.

Keep all existing project sources, rules and approvals. No paid generation or public publishing was authorised or executed as part of this release.
