"""No-network orchestration tests. No paid model calls or real media."""
from __future__ import annotations

import unittest
from collections import Counter

from cbted_studio_graph import Artifact, Provider, Stage, State, build_graph, initial_state


class FakeProvider:
    def __init__(self, revise_once: str | None = None, missing_media: bool = False):
        self.calls: Counter[str] = Counter()
        self.revise_once = revise_once
        self.missing_media = missing_media

    def produce(self, stage: Stage, state: State, idempotency_key: str) -> Artifact | None:
        self.calls[stage] += 1
        n = self.calls[stage]
        content = "[Verse 1]\nTurnip song\n[Chorus]\nTurnip chorus" if stage == "lyrics" else f"{stage}: useful creative output {n}"
        uri = f"storage://test/{stage}/{n}" if stage in ("music", "image", "video") and not self.missing_media else ""
        return {
            "stage": stage, "version": n, "kind": stage,
            "content": content, "uri": uri,
            "source_ids": [], "idempotency_key": idempotency_key,
        }

    def inspect(self, stage: Stage, artifact: Artifact, reviewer: str):
        if self.revise_once == stage and artifact["version"] == 1 and reviewer == "qa_fidelity":
            return "revise", ["Fix the weak part, preserve approved work"]
        return "pass", []

    def verify_media(self, uri: str) -> bool:
        return uri.startswith("storage://test/") and not self.missing_media

    def verify_final_export(self, video: Artifact, music: Artifact) -> bool:
        return bool(video["uri"] and music["uri"]) and not self.missing_media


def input_state() -> State:
    s = initial_state("test-owner", "test-project", "test-run", "Write a song about turnips")
    s["spend_approvals"] = {"music": True, "image": True, "video": True}
    s["final_approval"] = True
    return s


class GraphTests(unittest.TestCase):
    def invoke(self, provider: FakeProvider | None, data: State, tid: str = "t"):
        g = build_graph(provider)
        cfg = {"configurable": {"thread_id": tid}, "recursion_limit": 120}
        return g, cfg, g.invoke(data, cfg)

    def test_unconfigured_provider_fails_closed(self):
        _, _, end = self.invoke(None, input_state())
        self.assertFalse(end["completed"])
        self.assertIn("No working provider", end["blocked_reason"])
        self.assertEqual(end["artifacts"], {})

    def test_real_asset_and_dual_reviews_required(self):
        provider = FakeProvider()
        g, cfg, end = self.invoke(provider, input_state())
        self.assertTrue(end["completed"], end["blocked_reason"])
        self.assertTrue(end["completion_evidence"])
        for stage in ("idea", "poem", "lyrics", "suno", "music", "storyboard", "image", "video"):
            self.assertEqual(provider.calls[stage], 1, stage)
            reviewers = {r["reviewer"] for r in end["reviews"] if r["stage"] == stage}
            self.assertTrue({"qa_fidelity", "qa_continuity"}.issubset(reviewers))
        video_master_reviewers = {
            r["reviewer"] for r in end["reviews"]
            if r["stage"] == "video" and r["reviewer"].startswith("master_")
        }
        self.assertEqual(video_master_reviewers, {"master_technical", "master_creative"})
        calls = provider.calls.copy()
        again = g.invoke({}, cfg)
        self.assertTrue(again["completed"])
        self.assertEqual(provider.calls, calls, "Completed work must not execute twice")

    def test_paid_work_requires_explicit_permission(self):
        state = input_state()
        state["spend_approvals"] = {}
        provider = FakeProvider()
        _, _, end = self.invoke(provider, state)
        self.assertFalse(end["completed"])
        self.assertIn("approval required for music", end["blocked_reason"])
        self.assertEqual(provider.calls["music"], 0)

    def test_revision_repairs_only_failed_stage(self):
        provider = FakeProvider(revise_once="lyrics")
        _, _, end = self.invoke(provider, input_state())
        self.assertTrue(end["completed"], end["blocked_reason"])
        self.assertEqual(provider.calls["idea"], 1)
        self.assertEqual(provider.calls["poem"], 1)
        self.assertEqual(provider.calls["lyrics"], 2)
        self.assertEqual(len(end["artifact_history"].get("lyrics", [])), 1)
        self.assertEqual(end["attempts"]["lyrics"], 1)

    def test_idea_can_retry_without_graph_key_error(self):
        provider = FakeProvider(revise_once="idea")
        _, _, end = self.invoke(provider, input_state())
        self.assertTrue(end["completed"], end["blocked_reason"])
        self.assertEqual(provider.calls["idea"], 2)
        self.assertEqual(provider.calls["poem"], 1)

    def test_missing_media_blocks_and_keeps_prior_work(self):
        provider = FakeProvider(missing_media=True)
        _, _, end = self.invoke(provider, input_state())
        self.assertFalse(end["completed"])
        self.assertEqual(end["stage"], "music")
        self.assertIn("verified private media", end["blocked_reason"])
        self.assertEqual(provider.calls["lyrics"], 1)


if __name__ == "__main__":
    unittest.main()
