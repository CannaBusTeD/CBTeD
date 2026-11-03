# CBTeD ChatGPT-native MCP bridge

## Purpose

CBTeD operates inside ChatGPT through a custom MCP plugin. GitHub holds the authoritative rules and studio definitions. Supabase securely stores creative projects, source versions, corrections, approvals, task progress and outputs. ChatGPT itself performs creative work through available native tools, one operation at a time, as the master workflow requires.

The existing web project manager is optional supporting infrastructure. The OAuth consent page is only a one-time sign-in and approval screen.

## Deployed backend

- Supabase project: dmzzyfiwtosxtyekpbfi
- Edge Function: cbted-mcp, version 3 reported ACTIVE.
- MCP URL: https://dmzzyfiwtosxtyekpbfi.supabase.co/functions/v1/cbted-mcp
- Protected resource metadata: https://dmzzyfiwtosxtyekpbfi.supabase.co/functions/v1/cbted-mcp/.well-known/oauth-protected-resource
- OAuth issuer: https://dmzzyfiwtosxtyekpbfi.supabase.co/auth/v1
- One-time consent page (pending GitHub Pages verification): https://cannabusted.github.io/CBTeD/oauth/consent/
- Source file: supabase/functions/cbted-mcp/index.ts
- Simulated protocol and authorization tests: tests/check-cbted-mcp.mjs

The server embeds thirteen full rule documents from the GitHub repository, together with their original blob SHA identifiers. Changes to these governing documents require rebundling and redeploying the server. Rules are returned directly to ChatGPT, not replaced by a generic summary.

## Tools exposed

Public read: cbted_get_rulebook.

Authenticated private operations: cbted_list_projects, cbted_get_project_context, cbted_get_source_version, cbted_create_project, cbted_create_source, cbted_save_writing_version, cbted_approve_source_version, cbted_add_project_rule, cbted_create_task, cbted_record_output, cbted_set_task_state and cbted_get_asset_link.

The server does not invoke external generation providers. ChatGPT must use its own available tools to create any writing, image or video. A saved task or prompt does not mean generation has happened. Media output records require an actual persistent project asset ID; a temporary ChatGPT sandbox path is not durable Supabase storage.

## Secure connection tasks still required

1. In Supabase's CBTeD project dashboard, enable Authentication > OAuth Server. This admin-level switch is not accessible through the connected Supabase management tools.
2. Configure the authorization path to resolve to the consent page hosted at the GitHub Pages URL above. Check carefully how Supabase combines Site URL and Authorization Path, especially the /CBTeD/ path prefix.
3. Check the OAuth signing algorithm and supported scopes. Supabase documents that OpenID Connect ID tokens require asymmetric JWT signing keys; do not assume that is already configured.
4. Configure a compatible ChatGPT OAuth client registration mode (CIMD, dynamic registration or pre-registration), plus the exact ChatGPT redirect URI shown during setup. Do not guess redirect IDs.
5. In ChatGPT web, open Plugins, press plus, select Add custom MCP server (subject to account/workspace permissions), and enter the MCP URL. Select OAuth, approve the connection and install CBTeD.
6. Test cbted_get_rulebook, then authenticated cbted_list_projects. Test one private write in a disposable project and check it in Supabase before trusting production operations.

## Verification status

Supabase confirms the deployed function is ACTIVE. The source and matching GitHub file were retrieved. Live unauthenticated HTTP smoke tests could not be run from the current execution environment because public outbound requests to the Supabase project were unavailable. The scripted MCP tests are committed to GitHub Actions, but their CI result has not been independently confirmed.

The full ChatGPT OAuth redirect, token audience and refresh-token behaviour remain unverified. The actual plugin is **not yet installed or connected in ChatGPT**.

Security model: public rules may be fetched without authorization; project operations validate a Supabase user bearer and use owner-only row-level security. The function uses a publishable key, never the service-role key. Private asset links expire after 120 seconds. The consent page requires explicit approval and accepts only ChatGPT callback destinations.

## Mandatory post-draft lyric gate

Writing Studio's source now includes `writing/Lyric_Post_Draft_Editorial_Gate.md`. For every newly authored song, the final lyric is the **revised** draft: create draft 1; when a thumbnail is requested, submit one image job once the central concept is established; then execute three distinct stages in ChatGPT: (1) a brutal full-lyric, line-specific synthetic-phrasing critique, (2) editorial recommendations and precise repair plan, and (3) a source-based rewrite. Follow with an independent reread, spoken/sung-cadence proofread, and check that the completed thumbnail still aligns. Keep a previously approved or user-supplied original unchanged unless its revision was authorised. The full governing document is served by `cbted_get_rulebook(studio="writing")`. This procedure is beneath, not a modification of, the universal master.

## Operational contract

For every creative task, ChatGPT calls cbted_get_rulebook, retrieves project state and exact sources, applies locked project-specific corrections, prepares one unit, invokes the actual native generation tool if available, checks the result, records only what really exists, updates state, and repeats for the remaining separately requested units. It never marks generation complete from a prepared task record alone.
