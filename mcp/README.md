# CBTeD ChatGPT-native MCP bridge

## Purpose

CBTeD operates inside ChatGPT through a custom MCP plugin. GitHub holds the authoritative rules and studio definitions. Supabase securely stores creative projects, source versions, corrections, approvals, task progress and outputs. ChatGPT itself performs creative work through available native tools, one operation at a time, as the master workflow requires.

The existing web project manager is optional supporting infrastructure. The OAuth consent page is only a one-time sign-in and approval screen.

## Deployed backend

- Supabase project: dmzzyfiwtosxtyekpbfi
- Edge Function: cbted-mcp, version 4 reported ACTIVE.
- MCP URL: https://dmzzyfiwtosxtyekpbfi.supabase.co/functions/v1/cbted-mcp
- Protected resource metadata: https://dmzzyfiwtosxtyekpbfi.supabase.co/functions/v1/cbted-mcp/.well-known/oauth-protected-resource
- OAuth issuer: https://dmzzyfiwtosxtyekpbfi.supabase.co/auth/v1
- One-time consent page (pending GitHub Pages verification): https://cannabusted.github.io/CBTeD/oauth/consent/
- Source file: supabase/functions/cbted-mcp/index.ts
- Simulated protocol and authorization tests: tests/check-cbted-mcp.mjs

The server embeds thirteen full rule documents from the GitHub repository, together with their original blob SHA identifiers. Changes to these governing documents require rebundling and redeploying the server. Rules are returned directly to ChatGPT, not replaced by a generic summary.

## Tools exposed

Public read: cbted_get_rulebook.

Authenticated private operations: cbted_list_projects, cbted_get_project_context, cbted_get_source_version, cbted_create_project, cbted_create_source, cbted_save_writing_version, cbted_approve_source_version, cbted_add_project_rule, cbted_create_task, cbted_record_output, cbted_set_task_state and cbted_get_asset_link. Seven additional production tools were added to the live bridge: cbted_plan_production, cbted_get_production_status, cbted_approve_production_step, cbted_execute_next, cbted_claim_production_step, cbted_finish_production_step and cbted_retry_production_step. The installed plugin's cached tool schema may still list only the original tools until refreshed.

The MCP bridge itself does not generate media. It now proxies permitted execution into the separate authenticated Supabase `cbted-orchestrator` service, which includes guarded OpenAI text and image adapters. Paid execution is disabled by default; video/audio providers are not connected. ChatGPT may still use native tools, but the bridge cannot intercept or technically forbid those independent host calls. A saved task or prompt does not mean generation has happened. Media output records require a real private stored project asset, not a temporary ChatGPT sandbox path.

## Authenticated connection verified; production follow-up required

- The connected CBTeD plugin successfully returned the complete source rulebook and **real owner-scoped project records** through `cbted_list_projects` on 3 November 2026. No need to repeat the original OAuth installation procedure.
- Supabase reports `cbted-mcp` ACTIVE version 4 and `cbted-orchestrator` ACTIVE; after later code changes the orchestrator must be redeployed and source hash/version checked.
- The plugin's currently advertised tool list may remain at thirteen functions until the connection/tool manifest is refreshed. The backend now advertises seven additional production operations.
- The database has been migrated, and rollback-only stage/approval/media/failed-step tests were executed without a reported SQL error. GitHub Actions has returned a successful deterministic controller/MCP test run; this is not a full browser-to-provider live test.
- Full user-driven sign-in, `plan`, `execute`, `status`, per-stage approval, real asset inspection and paid provider interaction still require end-to-end validation. Test with a disposable project before using important source material.
- The linked GitHub repository is the code source of truth. `SUPABASE_ACCESS_TOKEN` must be securely configured before automatic GitHub-to-Supabase deployments can be trusted.
- See `docs/ORCHESTRATION.md` for exact state transitions, the API contract and blocked features.

Security model: public rules may be fetched without authorization; project operations validate a Supabase user bearer and use owner-only database rules. No service-role credentials are exposed to clients. Private asset links expire. Continue to verify the token audience and refresh flow in an independent end-to-end test.

## Mandatory post-draft lyric gate

Writing Studio's source now includes `writing/Lyric_Post_Draft_Editorial_Gate.md`. For every newly authored song, the final lyric is the **revised** draft: create draft 1; when a thumbnail is requested, submit one image job once the central concept is established; then execute three distinct stages in ChatGPT: (1) a brutal full-lyric, line-specific synthetic-phrasing critique, (2) editorial recommendations and precise repair plan, and (3) a source-based rewrite. Follow with an independent reread, spoken/sung-cadence proofread, and check that the completed thumbnail still aligns. Keep a previously approved or user-supplied original unchanged unless its revision was authorised. The full governing document is served by `cbted_get_rulebook(studio="writing")`. This procedure is beneath, not a modification of, the universal master.

## Operational contract

For every creative task, ChatGPT calls cbted_get_rulebook, retrieves project state and exact sources, applies locked project-specific corrections, prepares one unit, invokes the actual native generation tool if available, checks the result, records only what really exists, updates state, and repeats for the remaining separately requested units. It never marks generation complete from a prepared task record alone.
