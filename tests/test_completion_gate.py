import unittest
from orchestration.completion_gate import (
    ReviewDecision, Status, TaskSnapshot, approved_for_completion,
    next_action, should_dispatch,
)

class CompletionGateTests(unittest.TestCase):
    def task(self, **changes):
        data = dict(task_id="t1", revision=2, status=Status.REVIEW,
                    artifact_uri="storage://asset/v2",
                    required_reviewers=frozenset({"editor", "master"}),
                    decisions=(ReviewDecision("editor", 2, True),
                               ReviewDecision("master", 2, True)),
                    completion_revision=None)
        data.update(changes)
        return TaskSnapshot(**data)

    def test_all_current_reviews_required(self):
        self.assertTrue(approved_for_completion(self.task()))
        self.assertFalse(approved_for_completion(self.task(
            decisions=(ReviewDecision("editor", 2, True),))))
        self.assertFalse(approved_for_completion(self.task(
            decisions=(ReviewDecision("editor", 1, True),
                       ReviewDecision("master", 1, True)))))

    def test_complete_is_terminal(self):
        done = self.task(status=Status.COMPLETE, completion_revision=2)
        self.assertEqual(next_action(done, 0), "end")
        self.assertFalse(should_dispatch(done))

    def test_revision_reopens_work(self):
        old = self.task(status=Status.COMPLETE, completion_revision=1,
                        decisions=())
        self.assertTrue(should_dispatch(old))
        self.assertEqual(next_action(old, 0), "review")

    def test_retry_cap(self):
        waiting = self.task(decisions=())
        self.assertEqual(next_action(waiting, 3), "blocked")

if __name__ == "__main__":
    unittest.main()
