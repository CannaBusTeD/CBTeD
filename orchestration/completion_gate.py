"""CBTeD completion gate shared by LangGraph routing and API handlers.

A task is complete only when the current artifact revision has every required
review approval. Replays are no-ops. New revisions require a new review cycle.
"""
from __future__ import annotations
from dataclasses import dataclass
from enum import Enum
from typing import Mapping, Sequence

class Status(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    REVIEW = "review"
    COMPLETE = "complete"
    BLOCKED = "blocked"

@dataclass(frozen=True)
class ReviewDecision:
    reviewer: str
    revision: int
    approved: bool

@dataclass(frozen=True)
class TaskSnapshot:
    task_id: str
    revision: int
    status: Status
    artifact_uri: str | None
    required_reviewers: frozenset[str]
    decisions: tuple[ReviewDecision, ...]
    completion_revision: int | None = None

def approved_for_completion(task: TaskSnapshot) -> bool:
    if not task.artifact_uri or not task.required_reviewers:
        return False
    current = [r for r in task.decisions if r.revision == task.revision]
    by_reviewer: dict[str, bool] = {}
    for review in current:
        by_reviewer[review.reviewer] = review.approved
    return all(by_reviewer.get(name) is True for name in task.required_reviewers)

def next_action(task: TaskSnapshot, attempts: int, max_attempts: int = 3) -> str:
    """Use as the result of a LangGraph conditional-edge router."""
    if task.status == Status.COMPLETE and task.completion_revision == task.revision:
        return "end"
    if approved_for_completion(task):
        return "finalize"
    if attempts >= max_attempts:
        return "blocked"
    if task.status == Status.REVIEW:
        return "revise"
    return "review"

def should_dispatch(task: TaskSnapshot) -> bool:
    """Prevent duplicate external generation on replay/resume."""
    return not (task.status == Status.COMPLETE and
                task.completion_revision == task.revision)

# The finalize node MUST perform an atomic compare-and-set in Supabase:
# UPDATE tasks SET status='complete', completion_revision=:revision
# WHERE id=:id AND revision=:revision AND status <> 'complete';
# It must verify all approvals server-side in the same transaction.
# Unique job keys should be (task_id, revision, stage, operation).
# Never let an LLM set completion status directly.
