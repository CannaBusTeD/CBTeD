# CBTeD controlled production architecture

## Production topology
- **GitHub**: sole tracked source for controller code, agents, migrations, MCP bridge and tests.
- **Supabase**: authenticated project state, append-only approval decisions, atomic stage transitions, private assets and Edge Functions.
- **ChatGPT CBTeD MCP**: project-facing interface. It may prepare and inspect runs. Actual creative work in a native ChatGPT tool must still begin with a successful stage claim and be recorded only after a real output. The server cannot intercept arbitrary native ChatGPT tools, so those tools are not claimed as technically blocked.
- **Controlled backend executor**: can enforce stages for all calls it owns, including OpenAI text and image calls when credentials and explicit paid-execution flag are supplied.

## Agent roster
Writing: author > critic > editor > synthetic-language-pattern auditor > synthesizer > proofreader > reviewer.
Visual: analyst > tool selector > prompt writer > one image generator > actual-image reviewer for each separate image.
Audio: musical director > audio tool selector > audio generator > audio review.
Animation: storyboard > motion prompt > video tool selector > one video generator > actual-video reviewer for each clip > assembly > final release audit.
The language auditor flags formulaic phrasing but cannot determine human or AI authorship reliably.

## Two distinct instructions
- **Plan**: preview the deterministic stages without database mutation or generation.
- **Execute**: register an owned production run. Registration still does not run any generator. Every stage must be explicitly claimed; claim checks required predecessors, locked-rule snapshot, current state and any required step approval.

## Production safety
- Project ownership derives from Supabase Authentication; database transitions are atomic and refuse access to other owners.
- App roles have read-only table privileges. All writes flow through narrow, explicitly granted functions that separately check owner identity.
- Media stage approval is required individually. Revocation supersedes prior approval, and a failed stage blocks advancement.
- Each media output must have an owned asset metadata record **and a real object in the private Supabase Storage bucket** before a stage can pass. The backend external-completion route also checks the object exists. The image reviewer reads the actual private generated image rather than judging only its prompt.
- Passing a production stage means the operation returned a recorded result, not that an external judge proved artistic quality. The next dedicated review agent covers quality.
- Paid API calls are **disabled by default**. They require `OPENAI_API_KEY`, `CBTED_ALLOW_PAID_GENERATION=true`, an explicit per-run paid-call cap `CBTED_MAX_PAID_STEPS_PER_RUN`, and configured `CBTED_TEXT_MODEL` / `CBTED_IMAGE_MODEL` where appropriate. This is an operation cap, not a guaranteed monetary spending limit.
- Video and audio backend adapters have not been connected to generation providers; these stages block rather than pretend completion.
- Completing a studio's rules and actual source selection is a prerequisite for generation. The executor retrieves the full pinned rulebook from CBTeD MCP and fails closed if the context exceeds its maximum size rather than silently truncating the rules.
- One `execute-next` request runs at most one stage. No hidden batch execution.

## API endpoints
POST /functions/v1/cbted-orchestrator/plan with {workflow,intent,project_id,instructions,source_version_id,image_count,video_count}. Intent `plan` previews; `execute` registers a run.
POST /status {run_id}; /approve {run_id,step_key,decision}; /claim {run_id,step_key}; /finish {run_id,step_key,result,text,asset_id}; /retry {run_id,step_key}; /execute-next {run_id}. All POST paths require a real Supabase user bearer.
GET /health reports service status (not user data).

## Deployment checklist
1. Review and merge the feature PR after GitHub Actions syntax and behaviour tests succeed. Its browser Production Controller is in `app/production.html`, linked from `app/index.html`, and uses the existing Supabase browser login.
2. Both production migrations have already been applied to the live CBTeD Supabase project: `20261103131500_create_cbted_production_controller.sql` and `20261103170000_require_existing_private_asset_for_media.sql`. Do not reapply them to the same database.
3. Configure a GitHub deployment secret `SUPABASE_ACCESS_TOKEN` and review access to `cbted-production` environment.
4. The Edge Functions have been manually deployed to project `dmzzyfiwtosxtyekpbfi` from the same development branch. The repository contains CI deployment automation, but GitHub-to-Supabase automatic deployment is not considered operational until the credential is configured and a real workflow deployment succeeds.
5. Test an authenticated owner preparing a disposable run, inspecting status, blocked claim, explicit approval, real output and stage advancement. Test a second account denied access.
6. Configure provider credentials only after checking costs and terms. Keep live paid generation off until the separate approval workflow is proven.

## Limits
This is an orchestration foundation, not a fully autonomous video-production service. Supabase does not grant control over ChatGPT-native image/video invocations, and model API accounts, production audio/video tools, video assembly, proper monetary budget limits and user acceptance tests still need integration. No finished audio/video claims are permitted without actual assets.

## Verification record, 3 November 2026
- The 23-agent deterministic planner parsed and passed local isolated tests covering intent isolation, dependency checks, per-unit counts and revoked approvals. GitHub Actions also reported passing orchestration/MCP tests.
- Supabase applied the two production migrations successfully and reports the new tables and production RPCs. A rollback-only owner-impersonation test exercised dependency, missing approval, missing media and retry behaviour without an error response.
- `cbted-mcp` authenticated account access was confirmed by successfully listing real CBTeD project records; core master-rule retrieval succeeded.
- The orchestrator and MCP Edge Functions were manually deployed. Live browser UI, paid creative calls, multimodal image judgement, second-user denial and complete media assembly remain unverified.
- Supabase security advisor emits an intentional WARNING for authenticated, ownership-checked `SECURITY DEFINER` RPCs; those functions have explicit `auth.uid()`/owner checks but need a dedicated security review. The project also reports an unrelated existing leaked-password-protection warning.
