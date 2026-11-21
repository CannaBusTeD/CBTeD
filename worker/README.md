# CBTeD StudioS LangGraph worker prototype

**Status: engineering prototype only. No running worker, model provider, private database connection or media generation is asserted.**

This is an optional cyclic execution engine for the canonical CBTeD system. **Existing Supabase project `dmzzyfiwtosxtyekpbfi` remains authoritative** for project ownership, stage claiming, asset storage, independent approvals, version history, paid credits and completion.

The graph defines specialist nodes for idea development, editorial review, persona alignment, poetry, songwriting, Suno prompts, audio, storyboard, image and video, with two different QA reviewers on each produced artifact and a final master audit. Revisions return to the deficient stage only; previous approved stages are preserved. Current-state completion is terminal, and paid operations cannot run without explicit approval. Missing provider adapters fail closed.

Run offline tests:

```sh
python -m pip install -r worker/requirements.txt
python -m unittest discover -s worker -p 'test_*.py' -v
```

A production deployment still requires:

1. A separately hosted **Python** runtime with authenticated HTTP endpoints. Supabase Edge Functions use Deno and cannot host Python LangGraph directly.
2. Durable `AsyncPostgresSaver` or `PostgresSaver` in a restricted PostgreSQL schema, with real ownership and concurrency controls; the included `InMemorySaver` is tests only.
3. A server-side bridge that first claims stages through `cbted_claim_production_step` and finishes them through `cbted_finish_production_step` with real output evidence. Never allow the worker's model to update Supabase completion directly.
4. Verified provider adapters (and actual asset-byte verification) for writing, music, images and video. Provider jobs must be idempotent by stage+run+revision; a model response is not a media file. Request explicit spend approval for billable actions.
5. Authenticated, independent reviewer identity and real media inspection, plus full-length picture/audio final audit and creator sign-off. The mock provider used in tests is NOT a production reviewer.
6. Real user-tenant isolation and recovery tests, revocable permissions, credential rotation, and no public raw execution endpoints.

Do not merge this worker into the existing Deno orchestrator blindly or deploy it as a replacement. The target is **one orchestration authority, one creative project store**, with LangGraph handling allowed cyclic agent behaviour behind that authority.

The existing CBTeD StudioS integration contract is at [docs/CBTED_STUDIO_INTEGRATION.md](../docs/CBTED_STUDIO_INTEGRATION.md).
