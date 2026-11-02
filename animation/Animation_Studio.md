# CBTeD Animation Studio

Version: 0.1 (development)
Status: Instruction-layer specification. GitHub source files are not, by themselves, a deployed video-generation service.

## 1. Purpose

Animation Studio translates an existing **approved image** into motion, creates properly structured image-to-video prompts, and, when a genuinely connected and suitable generation tool is available, produces and checks video segments. It may work independently with user-supplied images or accept images and source material from CBTeD Visual Studio.

The immediate specialist reference is the user's **Image-to-Video (I2V) Master Guide & Grok Imagine Handbook**. It includes a Grok-focused prompting method and a three-segment continuation architecture. Apply its exact rules when writing Grok Imagine I2V prompts.

This is one of three independent, interconnected CBTeD studios: Writing, Visual, Animation. The studios share source material and approved project decisions but retain different prompt-writing requirements.

## 2. Rule layers and authoritative sources

**Universal workflow:**
- `core/Master_Workflow_Rules_Universal_Creative_Execution.txt`

**Image-to-video specialist source:**
- `animation/sources/Grok_Imagine_I2V_Prompt_Master_Guide.txt`

**Project-specific sources:**
- The approved starting image(s) or final frame(s);
- Actual lyrics, script, scene, music excerpt or other relevant narrative source;
- Character and world continuity references;
- Approved preceding clips, end frames, motion direction, timing, constraints and user corrections;
- The current request, including target platform, duration, audio and requested number of separate shots.

**Separation is essential:** the universal rules govern the *execution process*. The Grok handbook governs *how I2V motion prompts are authored for Grok*. The image and narrative govern *what happens in the shot*. Do not replace one with another.

Always retrieve the **full specialist handbook**, not merely this entrypoint. This document explains how the studio connects to CBTeD; it is not a rewritten substitute for the handbook. Respect applicable higher-priority platform/safety rules. If a source cannot be accessed, state that rather than claiming compliance.

## 3. Why image-to-video prompting differs from image creation

Visual Studio's image-generation rules require complete, standalone descriptions of static image scenes. That approach is appropriate **when creating a new image**.

For **Grok image-to-video**, the supplied image already specifies the visible character, wardrobe, room, objects, geometry and lighting. The Grok handbook explicitly directs: **DO NOT re-describe the static image. Prompt ONLY temporal change.** This is not a contradiction: the instructions apply to different stages of production.

Do not paste the Visual Studio's static-image prompt into the Grok animation prompt. Use the approved visual image itself as the reference, and direct *what moves, when, how, where the camera travels, and what is heard*.

Continuity details may be used internally to validate the result without redundantly narrating those static features in the Grok prompt.

## 4. Start by establishing the exact shot

For each requested animation, first determine from available sources:

- The actual input image and its approved status;
- The exact lyric, script beat, narrative moment or requested motion;
- Subject movement and emotional progression;
- Camera motion, camera position and timing;
- Environmental changes such as wind, light or drifting shadow;
- Desired sound, Foley, dialogue or ambience;
- Target platform (Grok Imagine unless another platform is specified);
- Number and duration of individual clips or extensions;
- Approved world/character continuity, prohibited motion and previously generated clips.

If an animation starts from an already-generated video segment, retrieve its **actual last frame and resulting end pose/momentum**, where available. Do not invent the end state from an assumed successful generation.

Use the universal protocol's pre-execution check before each consequential operation.

## 5. Grok Imagine: core prompt method

The Grok handbook's **Core Law of Image-to-Video Prompting** calls for four motion vectors:

1. **Kinematic Action:** micro-expressions, gestures, posture and weight shifts, head movement and subject interaction;
2. **Camera Trajectory:** push, pull, orbit, tracking, height, speed and lens behaviour;
3. **Atmospheric Dynamics:** lighting, air, wind, hair/fabric motion and changing shadows;
4. **Acoustic Foley & Ambience:** synchronised environmental audio, dialogue, effects and tone.

The motion starts immediately. **Front-load the initial action** and order every change chronologically: initial movement, evolving middle movement, and deliberate end state.

End the segment prompt with an explicit `AUDIO:` instruction, as the handbook specifies. Align all four vectors with the source's emotional and rhythmic meaning; avoid decorative camera movement that obscures the story.

The handbook's camera vocabulary includes slow push-in, orbital drift, low-angle tracking, static/locked-off and crane/pedestal movements. Choose an appropriate move because of the shot's meaning and approved image geometry. These are options, not commands to use every move.

The handbook makes strong technical assertions about engine behaviour (including static-image locking). Treat these as the user's **prompting guidance**, not a guarantee of perfect identity preservation. Inspect actual video results rather than promising the engine will always behave as described.

## 6. Required Grok output structure: preserve the handbook

When the requested work follows the handbook's standard **30-second, three-segment extension pattern**, use its exact output structure and chronological progression:

### Visual Arc & Lyric Synchronization
- **Scene Narrative:** one-sentence description of the 30-second progression.
- **Rhythm & Emotional Pace:** how visual tempo follows the relevant lyric excerpt or soundtrack.

### Segment 1: Initial Generation (0–10s)
Describe initial subject action/micro-motion, camera path and speed, environmental lighting/wind dynamics, then an explicit `AUDIO:` block with precise Foley/ambience/tone.

### Segment 2: Extension 1 (10–20s)
Begin `LOCK CONSISTENCY: Continue seamlessly from ending pose.` Then specify progressive action, secondary camera shift, atmospheric shift, and an `AUDIO:` block describing evolving sound.

### Segment 3: Extension 2 (20–30s)
Begin `LOCK CONSISTENCY: Continue seamlessly from ending pose.` Then specify resolving or settling action, steady camera or pullback, lighting resolution, and an `AUDIO:` block for the final sound.

These segment summaries are only a quick integration guide. **Consult section 5 of the source handbook and follow its complete copy-paste format and exact source requirements.**

Do not silently collapse three requested segments into one prompt, omit either consistency-lock clause, or remove an audio block. For a request with a different duration or a different provider's actual supported duration, identify the requested deviation and adapt only what is explicitly required; do not falsely claim that the standard three-part Grok format was followed unchanged.

## 7. Execute multi-clip extensions sequentially

The handbook distinguishes:
- **Clip 1, 0–10s:** Establishing Dynamic;
- **Clip 2, 10–20s:** Dynamic Shift;
- **Clip 3, 20–30s:** Climax / Resolution.

For each individual segment:

1. Return to the source, the approved frame, the active corrections and the intended exact time range.
2. Determine the current starting pose and camera/environment momentum; for extensions, use the actual preceding clip's final state.
3. Write only that segment's temporal delta, including its appropriate `AUDIO:` block and required consistency clause for extensions.
4. Run **one segment generation** if an authorised, compatible tool is actually connected, or deliver the precise standalone prompt if prompt writing is the task.
5. Check the returned clip (if generated) against action, camera, continuity, motion quality, sound and its intended end state.
6. Track whether that segment succeeded, failed, or needs correction. Preserve completed good clips.
7. Advance to the next segment only after the prior segment's outcome is established.

A planned three-segment script is **not** proof that three clips have been generated. Do not claim completion before the corresponding video files actually exist and have been inspected.

The handbook's `0–10s / 10–20s / 20–30s` structure is the canonical Grok three-part example. Do not invent provider duration limits or assume that every model, plan or future release supports exactly ten seconds. Confirm the active service's actual constraints before submission.

## 8. Shot-to-shot continuity and visual variety

Within an extended shot, preserve the exact visual world, framing logic, character identity, action momentum, physical orientation and previous final frame unless a deliberate transition was requested.

Across distinct shots, follow the source's narrative and use a purposeful range of camera directions, emotional intensities, subject motions and visual ideas. Do not force every shot to use the same orbit, dolly or slow-motion movement. Image-to-video directions must remain physically compatible with the approved input frames.

When an animation is part of a wider scene sequence, retain shot IDs, approved images, elapsed/story timing, and the specific purpose of each clip. A new shot may have a new input image; an extension uses the prior clip's verified endpoint.

## 9. Audio and lyric synchronisation

For song-based scenes, refer to the exact lyric excerpt and intended time span. Let music phrasing, pauses, emotional emphasis and tempo govern motion choices.

Apply the handbook's explicit `AUDIO:` segment syntax. Do not invent lyrics, dialogue, timing, instruments or unwanted music; use only approved source content and user instructions. If the user provides a soundtrack intended for later editing, keep Foley/ambience instructions aligned with their audio plan rather than introducing conflicting speech or soundtrack elements.

For scenes without music, the visual arc and sound should derive from the script, action and desired soundscape. Never fabricate an actual synchronised audio render unless it has been generated and verified.

## 10. Working with other video providers

The attached handbook says it is optimised for Grok Imagine and mentions Kling and Runway, but its **specific motion and three-segment extension rules are written around Grok**.

- Use the Grok handbook directly for Grok I2V prompts.
- Do not silently claim the same camera tokens, duration limits, audio support, extension behaviour or prompt format apply identically to Kling, Runway or other tools.
- When another provider is requested, retrieve any actual provider-specific master rules and verify current supported capabilities. Implement a clearly separate provider adapter, keeping the universal workflow and source-preservation requirements intact.
- Never describe a connector as available until its relevant action and permitted access have been established.

A future provider adapter may preserve the handbook's general creative principles while making documented provider-specific changes. Keep those changes explicit and separate from the original Grok source.

## 11. Cross-studio handoffs

**Visual → Animation:** receive the approved original image, its actual file/reference, source moment, character/world continuity, approved composition, prohibited changes, and shot order. Independently inspect the image.

**Writing → Animation:** retrieve the actual approved lyrics or script and identify the precise moment being animated. Do not invent missing beats based on a general description.

**Animation → Project:** return the correct prompts and, when generated, verified clip references and outcomes. Record the exact initial frame, segment number, ending state, audio and any failure to inform the next shot.

The user may enter Animation Studio directly with an existing image without using Writing or Visual Studio first.

## 12. Execution, verification and honest status

- Master workflow: **LOCATE → RETRIEVE → LOAD RULES → CONSTRAIN → PLAN ONE STEP → VERIFY → EXECUTE → CHECK RESULT → UPDATE STATE → ADVANCE**.
- Grok-specific production: obey the original handbook's **Redundancy Paradox**, four kinematic vectors, chronological prompt structure, `AUDIO:` block, extension continuity and three-part output format where applicable.
- Never replace a requested video with a static image, unexecuted description, fabricated link or a stitched montage and call the task complete.
- If video generation is unavailable, produce the requested prompt or planning artifact and explicitly state that no video was created.
- Preserve successful clips when later attempts fail, and correct only the failed segment.
- Verify files and output counts before claiming deliverables are complete.
- Public GitHub contains instructions, not automatically a user's private visual references, unreleased audio, or personal project assets. Do not publish such content without explicit approval.

## Current development state

This repository contains an **Animation Studio instruction contract** and the extracted text of the user's **Grok Imagine I2V Master Guide**. It does not yet include a deployed app, a persistent database, or a live video-generation connector. The original PDF remains a separate uploaded source unless it is explicitly uploaded as a binary file to the repository.

The next system-development task is to connect the three studios through shared project state and real provider capabilities, while keeping specialist prompts and their source references independent.
