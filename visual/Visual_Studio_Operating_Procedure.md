# CBTeD Visual Studio Operating Procedure

Version: 0.1 (development)
Status: Operating procedure for image-production tasks. This file defines HOW Visual Studio carries out image work. It sits alongside, and does not replace, the universal workflow or the visual prompt master guide.

## 1. Purpose

This procedure governs the practical execution of image-generation tasks in CBTeD.

It explains how Visual Studio should:
- identify the exact image task,
- retrieve the correct source and references,
- choose the correct generation mode and settings,
- construct the correct standalone prompt,
- generate one image at a time,
- inspect the result,
- repair failures,
- track completion,
- and hand approved images onward to Animation Studio where relevant.

This file is operational. It governs the step-by-step image-production procedure. It does not replace the universal workflow or the image prompt master guide.

## 2. Governing rule layers

Before performing any image task, Visual Studio must retrieve and apply all relevant layers:

### Universal workflow
- `core/CBTeD_Workflow.md`
- `core/CBTeD_Core.md`

### Visual rules
- `visual/sources/Image_Generation_Workflow.md`
- `visual/Visual_Studio.md`

### Current project authority
- the user's current request
- the supplied source material
- the supplied image references
- project continuity decisions
- prior approved outputs
- active corrections
- task-specific requirements such as format, ratio, image count, typography, and delivery purpose

The universal workflow governs HOW the work is done.
The visual prompt guide governs HOW image prompts are designed.
This operating procedure governs HOW Visual Studio performs the practical generation task.

If any required source cannot be retrieved, state that clearly. Do not pretend it was loaded.

## 3. Task-type identification

Before planning a prompt, Visual Studio must identify the exact task type.

Possible task types include:

1. **Text-to-image**
   - a new image from source material, concept or brief

2. **Reference-based generation**
   - a new image using one or more supplied reference images for identity, style, location, object, wardrobe, or composition guidance

3. **Image edit**
   - change an existing image while preserving most of it

4. **Inpaint / selected-region edit**
   - change a specific selected area of an image

5. **Outpaint / reframing**
   - extend an image to a new ratio or expand the composition

6. **Style-led image**
   - create a new image in a specified visual language

7. **Thumbnail**
   - create a cover image with title / artist / branding text

8. **Poster / key art**
   - create a designed promotional image

9. **Sequential image set**
   - create multiple separate images for a song, story, video or campaign

10. **Image set for animation**
   - create stills intended for later image-to-video animation

Never begin prompting until the task type is explicitly identified.

## 4. Required pre-generation retrieval

Before generating any image, retrieve and review the following where applicable:

### A. Source material
Examples:
- lyrics
- script
- story
- scene description
- poem
- treatment
- approved concept notes
- event description
- product details
- factual content if required

### B. References
Examples:
- character identity photos
- clothing references
- style references
- location references
- object references
- composition references
- previous approved images
- direct edit targets

### C. Project continuity
Examples:
- locked character appearance
- locked clothing
- established world
- established palette or realism level
- already-covered scenes
- prohibited repeated imagery
- prior corrections

### D. Output requirements
Examples:
- requested count
- exact ratio
- text required in-image
- whether it is a thumbnail, poster, still frame, or storyboard image
- whether transparent background is required
- whether photorealism or stylisation is required

If any of these are unclear but retrievable, retrieve them.
Only ask the user for information when it is genuinely missing.

## 5. Reference-role assignment

Every supplied reference must be assigned a role before use.

### Allowed roles
- CHARACTER = identity
- STYLE = visual language
- CLOTHING = wardrobe
- LOCATION = environment
- OBJECT = prop/product appearance
- COMPOSITION = framing / arrangement
- EDIT TARGET = the exact image to modify
- CONTINUITY ANCHOR = prior approved output used to preserve consistency

When writing the prompt, the references must be described by role, not merely attached blindly.

Do not waste reference slots on plain text unless the typography itself must be imitated.

Do not confuse a character reference with a style reference.
Do not confuse a composition reference with an edit target.

## 6. Multi-image set planning

When the user requests a set of images, do not immediately begin generation.

First establish internally:

- total number of required final images
- whether any thumbnail counts as one of those images
- the exact scene / moment / concept for each image
- which source moments have already been used
- which compositions have already been used
- which characters must appear in which images
- where visual variety must come from
- whether any later image depends on an earlier approved image for continuity

For each image in a set, determine:
- source moment
- visual metaphor
- environment
- main action
- surreal mechanism if applicable
- camera / composition
- purpose of the image

A set is not complete until the exact number of requested separate images exists.

A set is not a collage.

## 7. One image = one operation

Visual Studio must treat each image as its own independent production task.

That means:

- one image = one prompt
- one image = one generation operation
- one image = one inspection pass
- one image = one completion decision

Do not merge multiple requested images into one generated sheet, contact sheet or collage unless the user explicitly requested a collage.

Do not rely on “same as previous” shorthand in prompts.
Each prompt must be complete and standalone.

## 8. Prompt construction procedure

For each image, construct the prompt in the following order:

### Step 1: establish the image purpose
Examples:
- song visual
- animation still
- thumbnail
- poster
- documentary-style scene
- surreal key image
- reference frame

### Step 2: identify the exact source moment
Examples:
- specific lyric line
- specific script beat
- specific paragraph
- specific emotional concept

### Step 3: define the core design elements
- SUBJECT
- SOURCE
- METAPHOR
- ENVIRONMENT
- ACTION / BODY LANGUAGE
- SURREAL MECHANISM
- CAMERA / COMPOSITION
- LIGHT / COLOUR
- CONTINUITY
- NOVELTY
- PURPOSE

### Step 4: specify identity and references
If references are attached, identify them clearly in prompt language:
- Image A is the character reference
- Image B is the style reference
- Image C is the location reference
etc.

### Step 5: specify ratio and format
Ratio must be explicitly stated in each prompt.
Do not assume the tool remembers earlier settings.

### Step 6: specify required text
If exact text must appear in the image:
- quote it exactly
- specify placement
- specify tone / typographic role
- specify readability requirements

### Step 7: specify what must be preserved
Especially for edits:
- preserve identity
- preserve location
- preserve pose
- preserve composition
- preserve realism level
- preserve background
only changing the named elements

### Step 8: final prompt check
Before submission, verify that the prompt is:
- complete
- positive
- specific
- accurate to source
- ratio-explicit
- reference-aware
- free of “same as before” shorthand

## 9. Mode selection procedure

Before generation, select the correct mode.

### Use text-to-image when:
- there is no direct image being edited
- the user wants a new composition

### Use image edit when:
- an existing image must be altered

### Use inpaint when:
- only a selected region should change

### Use outpaint when:
- the task is to extend / reframe the image

### Use transparent-background mode when:
- the user explicitly wants transparency
- the user asks for background removal
- the output is a cutout / isolated asset

Do not use transparent output by default.

## 10. Generation settings checklist

Before running a generation, verify:

- correct mode selected
- correct aspect ratio selected
- correct reference images attached
- correct edit target attached if applicable
- correct transparency setting
- correct image count target
- correct prompt version
- correct scene number in the sequence
- correct project continuity notes
- correct text instructions if any

If any of the above is wrong, stop and correct it before generation.

## 11. Output inspection procedure

After each image is generated, inspect it against the request.

### Check for:
- correct aspect ratio
- correct number of images returned
- correct character identity
- correct clothing
- correct setting
- correct body language
- correct source interpretation
- correct surreal mechanism
- correct composition
- correct lighting / palette
- correct text rendering
- correct realism / style level
- correct anatomy
- correct continuity
- absence of unwanted collage layout
- absence of obvious accidental distortions

### For image edits also check:
- whether preserved elements were actually preserved
- whether only the requested changes were made

### For thumbnails/posters also check:
- readability of title / artist
- hierarchy of text
- spacing for text
- visual clarity at small size

Do not claim success until inspection is done.

## 12. Result classification

After inspection, classify the result as one of the following:

1. **Approved**
   - fully suitable
   - retain as final

2. **Approved with minor issues**
   - usable, but may need small refinement if the user wants it

3. **Repairable**
   - useful base exists
   - should be edited or corrected

4. **Failed**
   - wrong image
   - wrong ratio
   - wrong interpretation
   - wrong identity
   - wrong composition
   - wrong mode
   - not salvageable

This classification determines the next step.

## 13. Repair procedure

### If Approved
- keep the image
- record it as completed
- move to the next requested image

### If Approved with minor issues
- keep the image
- decide whether a correction pass is required

### If Repairable
- use the generated image as a continuity-preserving edit target where appropriate
- write a precise correction prompt
- state exactly what must change
- state exactly what must stay the same

### If Failed
- do not pretend it is acceptable
- regenerate correctly from source and references
- do not discard other successful images from the set

Never throw away successful images because one image failed.

## 14. Sequential set progression

For a multi-image set, after each completed image:

- record which source moment was used
- record the main metaphor
- record the composition type
- record camera distance / angle
- record which characters appeared
- record whether the image is approved
- update remaining image count

Before the next image:
- return to the source
- return to the references
- review what has already been covered
- deliberately select fresh visual territory

Reset properly before each next image.

## 15. Continuity rules

When continuity is required, maintain:
- character identity
- wardrobe if locked
- key props if recurring
- world logic
- realism/stylisation level
- mood and visual language
- project-wide restrictions

Continuity does not mean repetition.
Each image still needs novelty.

## 16. Variety rules

Across a set, deliberately vary:
- camera distance
- camera height
- camera angle
- character placement
- number of characters
- action
- environment
- architecture
- scale
- perspective
- depth
- emotional relationship
- surreal mechanism
- negative space
- density
- light conditions

Do not repeat the same “standing figure in same place” shot with trivial changes.

## 17. Thumbnail-specific operating procedure

When the requested item is a thumbnail:

1. treat it as its own image task
2. identify exact title text
3. identify exact artist / author text
4. identify whole-work central theme
5. identify strongest visual metaphor
6. design clear focal hierarchy
7. leave intentional typography space
8. ensure readability at small size
9. inspect text carefully after generation

A thumbnail counts as one image when the user says it does.

## 18. Poster / designed image procedure

When the requested item is a poster or designed composition:

- retrieve all required text
- retrieve any branding rules
- retrieve any product or event facts
- design layout space intentionally
- ensure text is not crammed into the image as an afterthought
- inspect both visual quality and text hierarchy

## 19. Source-sensitive and fact-sensitive work

If correctness depends on outside facts, retrieve the necessary factual information before generation.

Examples:
- rankings
- schedules
- results
- product specs
- event line-ups
- award winners
- dates

Do not guess at factual content when the image depends on it.

## 20. Sensitive-content caution

When the source contains body horror, injury, medical detail, disturbing psychological themes or anything that could be misconstrued as graphic:

- translate it carefully into acceptable visual language
- prefer implication over explicit gore unless clearly requested and allowed
- avoid accidental graphic interpretation
- phrase prompts so the intended emotional content is preserved without triggering unnecessary graphic output

This is especially important when surrealism is involved.

## 21. Delivery and completion

A Visual Studio task is only complete when:

- the exact number of requested final images exists
- each image has been checked
- failed items have been identified or corrected
- the user’s requested ratios and formats are met
- thumbnails/posters are counted correctly
- there is no false claim of completion

If the task is partial, say so clearly.

## 22. Handoff to Animation Studio

When approved images are intended for later animation, record and hand over:

- approved image file / reference
- exact source moment
- shot purpose
- character continuity details
- environment and composition
- mood / emotional beat
- props and important objects
- what motion seems likely or intended
- what must not change

Animation Studio must animate from the approved image, not redesign the image from scratch.

## 23. Current limitation statement

This procedure defines HOW Visual Studio should operate.
It does not itself guarantee:
- a connected image generator
- persistent project memory
- automatic asset management
- automatic publishing
- automatic cross-tool compatibility

Those require actual implementation.

## 24. Development note

This file should be used together with:
- the universal workflow
- CBTeD Core
- the image generation prompt master guide
- Visual Studio

It is the execution manual for practical image generation.
