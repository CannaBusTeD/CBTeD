# CBTeD Core
Version: 0.1 (development)
Status: Shared instruction layer; not yet a deployed plugin.

## Purpose

CBTeD Core is the common execution layer for CBTeD's independent but interconnected studios and for any future capability. It governs **how tasks are performed**, not the artistic, technical, or stylistic content of the task.

## Authoritative source: load in full

Before carrying out a task, read and apply the complete document at:

`core/Master_Workflow_Rules_Universal_Creative_Execution.txt`

That file contains the extracted text of the user's nine-page **Master Workflow Rules: Universal Creative Execution Protocol**. Its contents are authoritative for CBTeD's workflow. **This Core entrypoint is an integration guide, not a replacement, condensed substitute, or amendment to that source.** Do not infer missing rules from the brief descriptions in this file. When packaging CBTeD, include the complete master-rule file as a local accessible reference and verify that the runtime can retrieve it. A GitHub link alone is not proof that the runtime has read it.

If the authoritative reference is unavailable in the runtime, disclose that limitation; do not claim the master protocol was loaded or followed.

## Separation of responsibilities

1. **CBTeD Core** applies the universal execution method and maintains correct task position.
2. **Studio instructions** specify domain methods. Writing, Visual, and Animation studios are designed independently and may work alone or cooperate.
3. **Project-specific materials** specify the actual creative world and requirements: supplied lyrics, documents, images, scripts, technical specifications, references, format rules, continuity, approved drafts, and user corrections.
4. **The current request** defines the task, requested outputs, number of operations, and current changes.

Apply the master document's rule hierarchy and all applicable higher-priority platform/safety instructions. Do not promote a studio preference, template, or model habit above a user's relevant project-specific requirement. Do not silently change an established project decision.

## Entry procedure for every request

Apply the **UNIVERSAL EXECUTION LOOP** from the authoritative source without omitting or merging stages:

1. LOCATE
2. RETRIEVE
3. LOAD RULES
4. CONSTRAIN
5. PLAN ONE STEP
6. VERIFY
7. EXECUTE
8. CHECK RESULT
9. UPDATE STATE
10. ADVANCE

Use the full source document's definitions for these stages, not only their names here. Perform the source document's **pre-execution check**, **stop condition**, and **final compliance check** at the required points.

## Shared project state

Maintain and, when a suitable persistent store is available, record:

- Current task and exact next step.
- The actual governing source files and their versions/identifiers.
- Active project rules, negative constraints, corrections, and locked decisions.
- Character, style, setting, format, and other continuity facts where applicable.
- Approved artifacts and outputs already completed.
- Failed operations and the corrective action needed.
- Remaining outputs and completion criteria.

A proposed project-state structure is not itself evidence that persistent storage exists. Retrieve and verify stored information when continuity depends on it. If persistence is unavailable, be transparent and use the context actually accessible.

## Studio handoff

A studio receiving work from another studio must consult the actual approved source and shared state, not reconstruct them from a vague summary. It must preserve the relevant locked decisions, note the current position, and apply its own specialist instructions in addition to the complete master workflow. The receiving studio must not silently revise upstream approved work.

Each studio must also accept a new task independently when the user brings their own source material.

## Execution and completion

- Treat separate user-requested operations as atomic when required. Verify and complete each before proceeding to the next.
- Recheck constraints for every repeated operation, not just the first.
- Preserve successful results if one operation fails; correct the failed step rather than changing the workflow.
- Never claim that a file, image, animation, integration, or verification exists until the relevant result has been checked.
- Do not declare the overall task complete until every authorised deliverable and requested format is accounted for.
- Ask only for genuinely missing information that cannot be retrieved from the available context.

These are implementation reminders drawn from the authoritative protocol. For the full obligations and exact language, consult the master document.

## Development scope

CBTeD Core does **not** itself generate images, animate video, call third-party services, or persist projects. Those capabilities require separate studio specifications, connected tools, and testing. Do not advertise them as working merely because this file exists.

## Next development milestone

Design and implement **Writing Studio** as the first specialist module, connecting it to this Core and testing its ability to consult sources, preserve approved writing, apply specialist references, handle corrections, and complete an authorised sequence.
