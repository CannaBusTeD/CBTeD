"""CBTeD StudioS LangGraph execution contract.

This graph is optional execution machinery behind the existing Supabase
orchestrator. Supabase remains authoritative for ownership, stage claims,
approvals, revision IDs and completion. Do not expose this worker to untrusted
clients or use it to bypass those server-side checks.

No real provider is configured by default. It fails closed rather than
fabricating lyrics, music, media links, reviews or completion.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal, Protocol, TypedDict

from langchain_core.messages import BaseMessage, HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph, add_messages

Stage = Literal["idea", "poem", "lyrics", "suno", "music", "storyboard", "image", "video"]
Verdict = Literal["pass", "revise", "blocked"]
STAGES: tuple[Stage, ...] = (
    "idea", "poem", "lyrics", "suno", "music", "storyboard", "image", "video"
)
PAID_STAGES: frozenset[Stage] = frozenset(("music", "image", "video"))


class Artifact(TypedDict):
    stage: Stage
    version: int
    kind: str
    content: str
    uri: str
    source_ids: list[str]
    idempotency_key: str


class Review(TypedDict):
    stage: Stage
    version: int
    reviewer: str
    verdict: Verdict
    findings: list[str]


class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    owner_id: str
    project_id: str
    run_id: str
    instructions: str
    active_persona: str
    current_agent_turn: str
    stage: Stage
    constraints: list[str]
    artifacts: dict[str, Artifact]
    artifact_history: dict[str, list[Artifact]]
    reviews: list[Review]
    review_flags: dict[str, bool]
    attempts: dict[str, int]
    max_attempts: int
    spend_approvals: dict[str, bool]
    final_approval: bool
    blocked_reason: str
    completed: bool
    completion_evidence: str


class Provider(Protocol):
    """An injected, authenticated adapter. Never install arbitrary GitHub code here."""

    def produce(self, stage: Stage, state: State, idempotency_key: str) -> Artifact | None:
        """Return the real produced artifact, or None if unavailable."""

    def inspect(self, stage: Stage, artifact: Artifact, reviewer: str) -> tuple[Verdict, list[str]]:
        """Review the actual artifact independently, not another agent's summary."""

    def verify_media(self, uri: str) -> bool:
        """Confirm real media bytes exist in authorised private storage."""

    def verify_final_export(self, video: Artifact, music: Artifact) -> bool:
        """Inspect the playable export and its intended soundtrack."""


@dataclass
class UnconfiguredProvider:
    def produce(self, stage: Stage, state: State, idempotency_key: str) -> None:
        return None

    def inspect(self, stage: Stage, artifact: Artifact, reviewer: str) -> tuple[Verdict, list[str]]:
        return "blocked", ["Review provider unavailable"]

    def verify_media(self, uri: str) -> bool:
        return False

    def verify_final_export(self, video: Artifact, music: Artifact) -> bool:
        return False


def initial_state(owner_id: str, project_id: str, run_id: str, instructions: str) -> State:
    return {
        "messages": [HumanMessage(content=instructions)],
        "owner_id": owner_id, "project_id": project_id, "run_id": run_id,
        "instructions": instructions, "active_persona": "CBTeD StudioS",
        "current_agent_turn": "", "stage": "idea", "constraints": [],
        "artifacts": {}, "artifact_history": {}, "reviews": [],
        "review_flags": {}, "attempts": {}, "max_attempts": 3,
        "spend_approvals": {}, "final_approval": False,
        "blocked_reason": "", "completed": False, "completion_evidence": "",
    }


def create_stage(state: State, stage: Stage, provider: Provider) -> dict[str, Any]:
    if state.get("completed"):
        return {"current_agent_turn": "terminal", "blocked_reason": ""}
    if state.get("stage") != stage:
        return {"blocked_reason": "Stage mismatch; canonical stage claim required"}
    existing = state.get("artifacts", {}).get(stage)
    if existing and state.get("review_flags", {}).get(stage) is True:
        return {"current_agent_turn": "skip_completed_stage"}
    if stage in PAID_STAGES and not state.get("spend_approvals", {}).get(stage, False):
        return {"blocked_reason": f"Explicit paid-operation approval required for {stage}"}
    if stage == "music":
        lyrics = state["artifacts"].get("lyrics")
        suno = state["artifacts"].get("suno")
        if not lyrics or not suno or not state["review_flags"].get("suno"):
            return {"blocked_reason": "Approved lyrics and Suno structure required"}
        if "[Verse" not in lyrics["content"] or "[Chorus" not in lyrics["content"]:
            return {"blocked_reason": "Suno sections missing from approved lyrics"}
    if stage in ("storyboard", "image", "video"):
        music = state["artifacts"].get("music")
        if not music or not state.get("review_flags", {}).get("music") or not music["uri"]:
            return {"blocked_reason": "Approved, verified song audio is required"}
        if not provider.verify_media(music["uri"]):
            return {"blocked_reason": "Music URL does not resolve to verified audio"}
    key = f"{state['run_id']}:{stage}:{state.get('attempts', {}).get(stage, 0)}"
    new_artifact = provider.produce(stage, state, key)
    if new_artifact is None:
        return {"blocked_reason": f"No working provider for {stage}; no generation submitted"}
    if new_artifact["stage"] != stage or new_artifact["idempotency_key"] != key:
        return {"blocked_reason": "Provider returned an untrusted or mismatched artifact"}
    if stage in ("music", "image", "video") and (
        not new_artifact["uri"] or not provider.verify_media(new_artifact["uri"])
    ):
        return {"blocked_reason": "Provider returned no verified private media asset"}
    history = {k: list(v) for k, v in state.get("artifact_history", {}).items()}
    old = state.get("artifacts", {}).get(stage)
    if old:
        history.setdefault(stage, []).append(old)
    artifacts = {**state.get("artifacts", {}), stage: new_artifact}
    flags = {**state.get("review_flags", {}), stage: False}
    return {
        "current_agent_turn": f"generate_{stage}", "artifacts": artifacts,
        "artifact_history": history, "review_flags": flags,
        "blocked_reason": "",
    }


def ideation_engine(s: State, p: Provider) -> dict[str, Any]:
    return create_stage(s, "idea", p)


def poem_writer(s: State, p: Provider) -> dict[str, Any]:
    return create_stage(s, "poem", p)


def song_creation(s: State, p: Provider) -> dict[str, Any]:
    return create_stage(s, "lyrics", p)


def suno_prompt_crafter(s: State, p: Provider) -> dict[str, Any]:
    return create_stage(s, "suno", p)


def audio_generation_specialist(s: State, p: Provider) -> dict[str, Any]:
    return create_stage(s, "music", p)


def storyboard_strategist(s: State, p: Provider) -> dict[str, Any]:
    return create_stage(s, "storyboard", p)


def image_generation_specialist(s: State, p: Provider) -> dict[str, Any]:
    return create_stage(s, "image", p)


def video_generation_specialist(s: State, p: Provider) -> dict[str, Any]:
    return create_stage(s, "video", p)


def review_artifact(s: State, p: Provider, reviewer: str) -> dict[str, Any]:
    stage = s["stage"]
    artifact = s.get("artifacts", {}).get(stage)
    if artifact is None:
        return {"blocked_reason": f"No {stage} artifact to review"}
    verdict, findings = p.inspect(stage, artifact, reviewer)
    record: Review = {
        "stage": stage, "version": artifact["version"],
        "reviewer": reviewer, "verdict": verdict,
        "findings": list(findings),
    }
    return {
        "reviews": [*s.get("reviews", []), record],
        "current_agent_turn": reviewer,
    }


def editorial_review_bot(s: State, p: Provider) -> dict[str, Any]:
    return review_artifact(s, p, "editorial")


def independent_qa_a(s: State, p: Provider) -> dict[str, Any]:
    return review_artifact(s, p, "qa_fidelity")


def independent_qa_b(s: State, p: Provider) -> dict[str, Any]:
    # Only the artifact goes into Provider.inspect. The reviewer does not see
    # the other reviewer's judgement or explanation.
    return review_artifact(s, p, "qa_continuity")


def reviews_for(s: State, stage: Stage) -> dict[str, Review]:
    artifact = s.get("artifacts", {}).get(stage)
    if not artifact:
        return {}
    found: dict[str, Review] = {}
    for r in s.get("reviews", []):
        if r["stage"] == stage and r["version"] == artifact["version"]:
            found[r["reviewer"]] = r
    return found


def after_editorial(s: State) -> str:
    if s.get("blocked_reason"):
        return "block"
    r = reviews_for(s, "idea").get("editorial")
    if not r or r["verdict"] == "blocked":
        return "block"
    return "qa_a" if r["verdict"] == "pass" else "retry"


def after_production(s: State) -> str:
    return "block" if s.get("blocked_reason") else "quality"


def quality_decision(s: State) -> str:
    if s.get("blocked_reason"):
        return "block"
    rs = reviews_for(s, s["stage"])
    required = (rs.get("qa_fidelity"), rs.get("qa_continuity"))
    if any(r is None or r["verdict"] == "blocked" for r in required):
        return "block"
    if any(r is not None and r["verdict"] == "revise" for r in required):
        return "retry"
    if len({r["reviewer"] for r in required if r}) != 2:
        return "block"
    return "advance"


def retry_current(s: State) -> dict[str, Any]:
    stage = s["stage"]
    tries = s.get("attempts", {}).get(stage, 0) + 1
    attempts = {**s.get("attempts", {}), stage: tries}
    # Keep all previous assets and audit records. Do NOT reset passed stages.
    if tries >= s.get("max_attempts", 3):
        return {"attempts": attempts, "blocked_reason": f"{stage} reached retry limit"}
    return {
        "attempts": attempts,
        "review_flags": {**s.get("review_flags", {}), stage: False},
        "blocked_reason": "",
        "current_agent_turn": "revise_one_stage",
    }


def after_retry(s: State) -> str:
    return "block" if s.get("blocked_reason") else s["stage"]


def advance(s: State) -> dict[str, Any]:
    stage = s["stage"]
    artifact = s.get("artifacts", {}).get(stage)
    if not artifact:
        return {"blocked_reason": "Cannot approve missing artifact"}
    flags = {**s.get("review_flags", {}), stage: True}
    current = STAGES.index(stage)
    if current + 1 == len(STAGES):
        return {"review_flags": flags, "current_agent_turn": "stage_accepted"}
    return {
        "review_flags": flags, "stage": STAGES[current + 1],
        "current_agent_turn": "stage_accepted",
    }


def after_advance(s: State) -> str:
    if s.get("blocked_reason"):
        return "block"
    if s["stage"] == "video" and s["review_flags"].get("video"):
        return "master"
    if s["stage"] == "poem":
        return "persona"
    return s["stage"]


def persona_alignment_agent(s: State) -> dict[str, Any]:
    if not s.get("active_persona"):
        return {"blocked_reason": "Persona reference is required"}
    return {"current_agent_turn": "persona_alignment_agent"}


def after_persona(s: State) -> str:
    return "block" if s.get("blocked_reason") else "poem"


def master_reviewer(s: State, p: Provider) -> dict[str, Any]:
    if not all(s.get("review_flags", {}).get(k, False) for k in STAGES):
        return {"blocked_reason": "Not every stage has two approved reviews"}
    video, music = s.get("artifacts", {}).get("video"), s.get("artifacts", {}).get("music")
    if not video or not music or not s.get("final_approval", False):
        return {"blocked_reason": "Final asset or explicit release approval missing"}
    if not p.verify_final_export(video, music):
        return {"blocked_reason": "Final movie/soundtrack audit failed"}
    # Independent full-length technical and creative reviews are mandatory.
    final_reviews: list[Review] = []
    for reviewer in ("master_technical", "master_creative"):
        verdict, findings = p.inspect("video", video, reviewer)
        final_reviews.append({
            "stage": "video", "version": video["version"],
            "reviewer": reviewer, "verdict": verdict,
            "findings": list(findings),
        })
    if any(r["verdict"] != "pass" for r in final_reviews):
        return {
            "reviews": [*s.get("reviews", []), *final_reviews],
            "blocked_reason": "Final technical or creative audit did not pass",
        }
    return {
        "completed": True, "current_agent_turn": "master_reviewer",
        "reviews": [*s.get("reviews", []), *final_reviews],
        "completion_evidence": f"{video['idempotency_key']}:{music['idempotency_key']}",
        "blocked_reason": "",
    }


def resume_route(s: State) -> str:
    if s.get("completed"):
        return "done"
    if s.get("blocked_reason"):
        return "block"
    stage = s["stage"]
    if s.get("review_flags", {}).get(stage):
        return "advance"
    if stage in s.get("artifacts", {}):
        return "editorial" if stage == "idea" and "editorial" not in reviews_for(s, "idea") else "qa_a"
    return stage


def build_graph(provider: Provider | None = None, checkpointer: Any = None) -> Any:
    p = provider or UnconfiguredProvider()
    graph = StateGraph(State)
    graph.add_node("resume_guard", lambda s: {"current_agent_turn": "resume_guard"})
    graph.add_node("ideation", lambda s: ideation_engine(s, p))
    graph.add_node("editorial", lambda s: editorial_review_bot(s, p))
    graph.add_node("persona", persona_alignment_agent)
    graph.add_node("poem", lambda s: poem_writer(s, p))
    graph.add_node("lyrics", lambda s: song_creation(s, p))
    graph.add_node("suno", lambda s: suno_prompt_crafter(s, p))
    graph.add_node("music", lambda s: audio_generation_specialist(s, p))
    graph.add_node("storyboard", lambda s: storyboard_strategist(s, p))
    graph.add_node("image", lambda s: image_generation_specialist(s, p))
    graph.add_node("video", lambda s: video_generation_specialist(s, p))
    graph.add_node("qa_a", lambda s: independent_qa_a(s, p))
    graph.add_node("qa_b", lambda s: independent_qa_b(s, p))
    graph.add_node("advance", advance)
    graph.add_node("retry", retry_current)
    graph.add_node("master", lambda s: master_reviewer(s, p))
    graph.add_node("block", lambda s: {"completed": False})

    producer_names = {
        "idea": "ideation", "poem": "poem", "lyrics": "lyrics",
        "suno": "suno", "music": "music", "storyboard": "storyboard",
        "image": "image", "video": "video",
    }
    # Stage choices are explicit and bound; never execute an arbitrary node
    # name returned from an LLM.
    graph.add_edge(START, "resume_guard")
    graph.add_conditional_edges(
        "resume_guard", lambda s: producer_names.get(resume_route(s), resume_route(s)),
        {**{name: name for name in producer_names.values()},
         "editorial": "editorial", "qa_a": "qa_a", "advance": "advance",
         "block": "block", "done": END}
    )
    for name in producer_names.values():
        graph.add_conditional_edges(
            name, after_production,
            {"quality": "editorial" if name == "ideation" else "qa_a", "block": "block"},
        )
    graph.add_conditional_edges("editorial", after_editorial, {"qa_a": "qa_a", "retry": "retry", "block": "block"})
    graph.add_edge("qa_a", "qa_b")
    graph.add_conditional_edges(
        "qa_b", quality_decision,
        {"advance": "advance", "retry": "retry", "block": "block"},
    )
    graph.add_conditional_edges("retry", lambda s: producer_names.get(after_retry(s), after_retry(s)),
                                {**{name: name for name in producer_names.values()}, "block": "block"})
    graph.add_conditional_edges(
        "advance", after_advance,
        {**{k: v for k, v in producer_names.items()},
         "persona": "persona", "master": "master", "block": "block"},
    )
    graph.add_conditional_edges("persona", after_persona, {"poem": "poem", "block": "block"})
    graph.add_edge("master", END)
    graph.add_edge("block", END)
    return graph.compile(checkpointer=checkpointer or InMemorySaver())
