# CBTeD mandatory multi-pass quality assurance contract

Status: **implementation specification only**. This document is not evidence that these gates exist or run in the deployed orchestrator.
Scope: **every CBTeD studio, every generated or edited asset, every handoff, and each final export**. Apply to writing, still images, audio, video animation, selective lip-sync, editing, assembly, publishing and future studios.

## Intent and non-negotiable acceptance rule
The user requires multiple, independent quality-control agents and checks **throughout** production, **at least two substantive quality reviews of every actual output before any downstream agent may use or advance it**, plus additional pre-execution checks and a comprehensive independent final audit of the assembled work. A provider's `SUCCEEDED` result, completed prompt, uploaded metadata or optimistic model claim is **not** quality approval.

All checks must consider the real source and the actual result (not merely the prompt). Checks must be recorded against immutable input/output version identifiers. Fail **closed** on missing evidence, unsupported capabilities, unverified identity/timing, absent assets, failed checks, or missing spend approval.

## Minimum gate protocol for EACH unit / stage

0. **Retrieve and lock context.** Load the user's original instruction, approved exact source/version, negative rules, continuity references, prior accepted assets and current stage. Do not reconstruct missing sources. Locate what is already finished before proposing another paid generation.
1. **Preflight QA A, specification.** A first independent checking agent verifies that the request, creative brief, referenced material, scope, output format, timeline, previous approval and stage order match; flag ambiguity, contradictions and unapproved changes.
2. **Preflight QA B, feasibility and expenditure.** A second independent checking agent verifies actual provider/adapter capabilities for the required modality, quality floor and controls, expected cost, available credit budget and required user permission. If the proposed method will predictably degrade the intended result, STOP before submission. Only an explicitly authorised small proof-of-capability test may proceed where quality is uncertain.
3. **Execute one authorised operation.** The domain specialist creates or edits ONE requested unit; retain originals, exact prompts/settings, job IDs, assets, timing and versions. No silent method substitution. A request to modify existing moving video must not be replaced with animating a still.
4. **Output QA A, specialist fidelity.** An independent domain reviewer inspects the **actual output** for craft, technical defects, compliance with original request and medium-specific rules. A text analysis is not proof of what an inaccessible media asset contains.
5. **Output QA B, independent continuity and integration.** A DIFFERENT independent reviewer inspects the actual output again against the same authorised source **and** its intended neighbours / next studio's input: continuity, timing, identity, style, narrative and semantic relationship. It must not just rubber-stamp the first review or copy its conclusion.
6. **Hard handoff gate.** Only if **both independent output QA passes** explicitly pass, required preflight passed, evidence exists and any author approval is recorded can Supabase mark this version eligible for handoff. A pass must refer to the concrete asset/version/segment checked. The next specialist must re-fetch the approved version, not rely on summaries. Failures are BLOCKED; downstream work does not start.
7. **Repair locally and re-review.** Identify the smallest deficient section. Preserve accepted material. Re-run any required preflight for a replacement method, seek permission for additional paid generation, repair only that unit and repeat both output QA checks. Failed results are retained as failed attempts, not relabelled accepted. Review cycles must not silently trigger credit-spending retries.

## Studio-specific mandatory checks

### Writing
- Review the source against requested meaning, tone, natural British English, individuality, banned tropes/patterns, rhythm/near rhyme, accuracy and structural instructions.
- After a draft or revision, run independent editorial/anti-slop analysis and a distinct proofread/author-intent continuity check **before** accepting the version. Review the finished text again before it becomes visual/audio source.
- Protect all user-approved words and earlier versions. Suggested rewrites must never silently become approved lyrics or be used as source elsewhere.

### Still image and visual design
- Verify that the proposed image matches the actual lyric/story beat and references **before** generating.
- Inspect the actual image for likeness, face and clothing, location, objects, hands/anatomy, style, composition, orientation, negative constraints, legibility where text is explicitly allowed, and fit to the approved narrative.
- Independently cross-check against preceding/following approved shots, character library and intended motion. Do not advance images on prompt quality alone.

### Audio and music
- Check the exact authorised track/dialogue version, sample rate and duration when accessible, performer/vocal passage map, genre/arrangement requirements and licensing/usage constraints.
- Review real output for audible quality, intelligibility, unwanted artifacts, musical or spoken content fidelity, mix and transitions. A second independent check verifies its fit with scenes and timeline.
- Keep an original audio master unchanged. A declared audio attachment is not proof that a final export contains audible correct audio.

### Animation, moving video and lip-sync
- Check the approved moving scene and required shot motion before submitting. The animation must fit lyric/story meaning, performance, camera work, atmosphere and surrounding scene timing.
- QA the **rendered moving footage** for identity throughout turns, natural movement, lighting, continuity, framing and timing; a second independent reviewer checks musical/narrative fit and continuity into/out of adjacent shots.
- Where selective singing is required, FIRST build/inspect the cinematic moving-footage edit and exact vocal time map, THEN extract brief moments and apply **audio-driven lip-sync to existing moving video**, preserving acting, background and camera motion. Static-face lip-sync is not an acceptable substitute.
- Inspect both lip alignment to the actual approved vocal and the composited result's identity, footage continuity and visual quality; two output checks apply to **each** modified passage. Do not create bland performance-only scenes to avoid this requirement.

### Video assembly, finishing and delivery
- Assemble from verified real moving clips using the exact approved full master audio/dialogue. Inspect actual file, not only an editing plan or assembly script.
- **Final QC A: independent technical audit of the assembled export**: file plays, duration, resolution/orientation, frame continuity, sound is present and audible, exact authorised soundtrack/dialogue is correctly aligned, no clipped/missing/truncated segments, no broken cuts, offsets or codec/export failures.
- **Final QC B: independent holistic creative audit of the ENTIRE finished film in sequence**: whole-song/dialogue sync, lyric-to-picture relevance, narrative sense, shot order and transitions, performer identity, wardrobe/props/location, lighting and colour continuity, camera and motion quality, emotional rhythm and all negative instructions. Inspect transitions and full narrative, not just isolated clips.
- If either final audit fails, do not label complete or deliver as finished. Repair the smallest affected portion; perform both targeted checks again and repeat both full-film final audits on the new export. Separate landscape/vertical exports each require final verification of crop, content and audio.

## Evidence, implementation and tests
- Persist records in owner-scoped Supabase: project/run/stage, asset ID and version, source rule snapshot, checking agent identity and role, evidence location, pass/fail criteria, findings, unresolved issues, timestamp, cost, user approval and handoff eligibility. Protect private assets; never commit unpublished material to the public repository.
- Represent gates in the **canonical backend plan and enforce them in database/API stage transitions**. A Markdown specification or prompt instruction alone cannot enforce a gate. An agent must not mark its own output as having passed two independent reviews.
- At least two genuinely distinct review roles and separately produced findings are required per actual output. Repeating the same generic 'looks good' response twice does not satisfy independence.
- Provide human approval where required, especially subjective creative decisions and spending; QC cannot guarantee taste or face fidelity without inspecting the real result.
- Regression tests must prove that an output with only one review cannot advance, duplicate/self-review is rejected, missing/inaccessible assets block, wrong soundtrack or absent audio blocks final release, failed segment stops only dependent work, no unauthorised paid retries occur, and a final assembled file cannot pass without BOTH independent full-video audits.

## Relationship to existing CBTeD architecture
**Extend, do not replace**, `docs/ORCHESTRATION.md`, the authoritative universal execution rules, and the existing writing/visual/audio/animation specialist procedures. Preserve the source-first, sequential, separately approved operations already in CBTeD. This contract increases the minimum QA enforcement and whole-production audit; runtime enforcement, provider adapters, automated media inspection and any necessary migrations remain **to be implemented, tested and verified**. No media generation is authorised by this document.