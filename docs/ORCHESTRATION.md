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
- Each media output must have a private stored project asset, not a temporary URL or generated prompt. Backend external-completion route also checks the object exists.
- Passing a production stage means the operation returned a recorded result, not that an external judge proved artistic quality. The next dedicated review agent covers quality.
- Paid API calls are **disabled by default**. They require OPENAI_API_KEY, CBTED_ALLOW_PAID_GENERATION=true, and explicit CBTED_TEXT_MODEL / CBTED_IMAGE_MODEL environment values.
- Video and audio backend adapters have not been connected to generation providers; these stages block rather than pretend completion.
- Completing a studio's rules and actual source selection is a prerequisite for generation. The executor retrieves the full pinned rulebook from CBTeD MCP.
- One `execute-next` request runs at most one stage. No hidden batch execution.

## API endpoints
POST /functions/v1/cbted-orchestrator/plan with {workflow,intent,project_id,instructions,source_version_id,image_count,video_count}. Intent `plan` previews; `execute` registers a run.
POST /status {run_id}; /approve {run_id,step_key,decision}; /claim {run_id,step_key}; /finish {run_id,step_key,result,text,asset_id}; /retry {run_id,step_key}; /execute-next {run_id}. All POST paths require a real Supabase user bearer.
GET /health reports service status (not user data).

## Deployment checklist
1. Review and merge the PR only after GitHub Actions syntax and behaviour tests succeed.
2. Apply the additive migration `supabase/migrations/20261103131500_create_cbted_production_controller.sql` once; do not repeat it on an existing environment without reviewing history.
3. Configure a GitHub deployment secret `SUPABASE_ACCESS_TOKEN` and review access to `cbted-production` environment.
4. CI deploys both Edge Functions from GitHub to project `dmzzyfiwtosxtyekpbfi` after tests. Confirm `cbted-orchestrator` and `cbted-mcp` are ACTIVE and inspect version and source.
5. Test an authenticated owner preparing a disposable run, inspecting status, blocked claim, explicit approval, real output and stage advancement. Test a second account denied access.
6. Configure provider credentials only after checking costs and terms. Keep live paid generation off until the separate approval workflow is proven.

## Limits
This is an orchestration foundation, not a fully autonomous video-production service. Supabase does not grant control over ChatGPT-native image/video invocations, and model API accounts, production audio/video tools, video assembly, spending limits and user acceptance tests still need integration. No finished audio/video claims are permitted without actual assets.
