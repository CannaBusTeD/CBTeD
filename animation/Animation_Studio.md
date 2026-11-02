# CBTeD Animation Studio

Version: 0.2 (development)
Status: Platform-neutral specialist studio and operational specification; not yet a deployed video-generation application.

## Governing layers

1. **Universal execution rules:** `core/Master_Workflow_Rules_Universal_Creative_Execution.txt`. These govern the method, sequential actions, checking, correction, and completion.
2. **Image-to-video prompting rules:** `animation/sources/Image_to_Video_Prompt_Master_Guide.md`. These govern how to write motion prompts across image-to-video tools.
3. **Original reference archive:** `animation/sources/Original_Image_to_Video_Guide_Archive.txt`. This is a verbatim extracted copy of the user's original three-page source, kept for provenance. Some claims in it concern the platform used when it was written; do not promote those into universal technical guarantees.
4. **Project source:** approved input image, source lyrics/story/script, previous clip or final frame, project continuity, user corrections, exact output requirements.
5. **Provider adapter:** current, verified tool-specific capabilities, controls and submission format. This is not part of the universal prompting technique.

Read the relevant **full** sources before acting. This entrypoint does not replace the master rules or the complete prompt guide. Apply applicable safety and platform constraints.

## Mission

Turn approved images into correctly configured, individually generated and verified video shots. The studio can start from an image supplied by the user or accept approved images from Visual Studio. Do not require the Writing or Visual Studio stages if the user already has usable source material.

The prompt guide is only one component of production. **Uploading the image, selecting the correct mode and settings, submitting, inspecting and saving the result are separate mandatory operations** when the user asks for actual generation.

## Operating procedure: one shot at a time

### Phase A: retrieve and lock inputs

1. Locate the actual approved image file/reference, rather than using a summary of its contents.
2. Locate the exact lyric, script beat, scene direction or animation request and the relevant timing.
3. Read project-level constraints and approved character, costume, prop, location and style continuity.
4. Determine whether this is a new shot, an extension of a prior clip, or a revision of a failed shot.
5. For an extension, inspect the **actual preceding clip and its end frame** where supported. Establish starting pose, camera momentum, environment and sound continuity.
6. Establish the requested number of **separate** outputs and exact completion criteria. Record the current shot index and outstanding shots.

### Phase B: select the tool and verify its capabilities

7. Identify the user-requested image-to-video service. If none is specified, choose only among genuinely available, suitable services and explain a material difference when it affects output.
8. Determine whether a connected tool can **actually** upload an image and generate video. Do not claim access merely because the tool's name appears in instructions.
9. Read the tool's current accepted image formats, input limits, image-to-video mode, model options, clip duration, aspect ratios, crop modes, output resolution, audio support, extension support, reference-image support, credits/cost, and submission schema where exposed.
10. If a needed control or capability is unavailable or unknown, **do not invent it**. Ask only for a genuinely necessary decision; otherwise make a supported default choice and disclose relevant limitations.
11. If no suitable generation tool is connected, stop at a fully prepared, clearly labelled prompt and settings handoff. Do not claim to have uploaded or generated anything.

### Phase C: prepare and attach the source image

12. Verify the input asset opens and is the correct approved version. Record its filename or source ID and dimensions if available.
13. Check whether the input image matches the requested video aspect ratio. Determine whether the selected service supports that ratio and whether it would crop, stretch, pad or reframe.
14. Preserve the image as supplied unless the user authorises an edit or the required conversion is part of the request. Never silently crop a character or change the composition to force a ratio.
15. Select the tool's **image-to-video** workflow, not text-to-video or image-generation mode.
16. Upload/attach the correct image through an actually available tool action. Confirm the service accepted the asset and it is assigned to the intended start-frame/reference slot. For extensions, use the verified end frame or extension source required by that service.
17. If upload fails, identify the failure, retain the original asset and retry only using supported actions or report the blocker.

### Phase D: configure generation before prompting

18. Choose the requested provider/model or a supported alternative authorised by the user.
19. Select the **exact requested aspect ratio** in the tool if supported. Verify the setting rather than assuming it was inherited from the image. If the service determines ratio automatically, verify its documented behaviour and resulting crop.
20. Select duration, resolution, frame rate, quality tier, seed, motion strength, camera controls, reference strength and other parameters **only when the actual tool exposes them**. Never pretend these controls exist universally.
21. Set audio on/off, soundtrack, dialogue or Foley according to the request and the service's real capabilities. Avoid adding generated audio when the user wants a silent clip for later music editing.
22. Check model restrictions, estimated credit cost where exposed, export format, output destination and any extension settings.
23. Re-read the configured values and compare them with the current shot specification before submission. Resolve mismatches first.

### Phase E: write the image-to-video prompt

24. Consult the full `Image_to_Video_Prompt_Master_Guide.md`.
25. Study the **actual input image** and write the temporal change, rather than redescribing static features already visible.
26. Define the immediate action, progression, meaningful subject kinetics, purposeful camera trajectory, relevant atmospheric changes and the intended end state.
27. Include sound directions when requested and supported; use the guide's `AUDIO:` convention or a provider-compatible equivalent.
28. For music, synchronise the visual arc with the exact approved passage and intended duration; do not invent lyrics or dialogue.
29. For an extension, continue from the **verified** prior end state. Use continuity-lock phrasing where useful, without assuming that words alone enforce consistency.
30. Respect the service's actual prompt length, field types, supported camera controls and syntax. Provider-specific differences belong in an adapter; do not rewrite the platform-neutral creative principles as though a provider-specific interface were universal.
31. Verify that the prompt contains only desired action and relevant motion, follows chronology, is physically coherent with the source image, and respects all project corrections.

### Phase F: submit one generation

32. Recheck source image attachment, correct workflow mode, selected model, aspect ratio/crop, duration, quality, audio, prompt, cost and target output count.
33. Submit **one authorised shot/segment** through the real generation action.
34. Record the returned job ID or equivalent only if supplied. Do not fabricate one.
35. Wait for the provider's actual completion/status mechanism. Do not assume that submission means successful generation.
36. If the provider rejects or fails the job, preserve successful earlier clips, record the exact error and correct only the failed step. Do not silently submit an unrelated replacement.

### Phase G: inspect and record the output

37. Retrieve/open the generated video when supported. Check that it is a playable video, not merely a prompt, preview image or queued job.
38. Verify actual orientation/aspect ratio, dimensions, duration and presence/absence of audio when this information is accessible.
39. Inspect source fidelity, character and object identity, anatomy, action, camera path, motion continuity, end frame, sound and prohibited changes.
40. Compare the result with the exact shot's source and project rules. Distinguish objective failure from optional artistic preference.
41. Preserve the generated file or returned provider reference in the actual accessible project state. Do not claim a file is saved or persistent unless verified.
42. Record the starting image ID, shot number, prompt version, settings actually used, output reference, verified final state, success/failure and remaining shot count.
43. If the clip is rejected or noncompliant, revise the relevant input, setting or prompt and regenerate **that** clip; retain previously accepted clips.

### Phase H: advance or hand off

44. For a requested extension, use the verified prior clip/end frame and repeat the full preparation, configuration, prompting, generation and checking cycle.
45. For a distinct new shot, retrieve its approved source image and exact narrative moment, and repeat the cycle independently.
46. Do not report the overall task complete until the requested number of separate clips has been generated and verified, or identify precisely what remains blocked.
47. Hand off the actual output references and shot order for assembly/editing. A proposed sequence or unexecuted prompt is not a rendered video.

## Multi-segment storytelling

The source guide illustrates a three-part narrative arc: establishment, development and resolution. This is a **creative structure**, not a universal ten-second duration setting. Adapt segment count and length to the user's request and the chosen service's verified constraints.

Each segment starts from an approved image or a verified preceding endpoint. Each is independently submitted and checked. Never merge multiple requested generations into one call just to save steps.

## Provider-specific adapters

Store service-specific operating instructions separately from this file. Each adapter must document the **actual current** supported upload method, workflow mode, start/end-frame handling, ratio and crop options, duration/resolution controls, audio controls, prompt limits, generation action, polling/status, export and failure handling. Mark unknown or unavailable controls as such.

A provider's UI may change. Do not claim to click a UI control unless a connected action actually allows it; if necessary, provide exact user-facing steps based on verified interface details. Never infer an API capability from the appearance of a consumer web interface.

## Studio independence and shared project state

Writing Studio provides approved narrative source when used. Visual Studio provides approved images and reference continuity when used. Animation Studio retrieves and inspects the **actual assets** and may operate alone with user-supplied material.

Share approved project decisions, source identifiers, completed and failed shot IDs, current task position and handoff data only through storage or context that is actually accessible. Do not claim that this Markdown file implements a persistent database.

## Completion status

This is a detailed **operational instruction specification**, not an installed image-to-video engine. A functioning implementation still requires connected generation actions, provider adapters, shared project state and the necessary authorisations. The prompt guide and universal workflow remain separate, authoritative source documents.
