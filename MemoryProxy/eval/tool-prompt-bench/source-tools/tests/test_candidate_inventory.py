import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location(
    "d0_candidate_inventory", ROOT / "build_candidate_inventory.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)
import source_lock  # noqa: E402


def messages(count):
    return [{"role": "user", "content": str(index)} for index in range(count)]


class CandidateInventoryTests(unittest.TestCase):
    def test_compact_inventory_selects_longest_task_and_extracts_metadata(self):
        swe = [
            {
                "instance_id": "i1",
                "repo": "getmoto/moto",
                "base_commit": "a" * 40,
                "created_at": "2024-02-01 00:00:00",
                "problem_statement": "First title\nPrivate full details",
                "patch": "diff --git a/moto/foo.py b/moto/foo.py\n+++ b/moto/foo.py\n",
                "test_patch": "diff --git a/tests/test_foo.py b/tests/test_foo.py\n+++ b/tests/test_foo.py\n",
            }
        ]
        oh = [
            {"instance_id": "i1", "trajectory_id": "short", "messages": messages(2)},
            {"instance_id": "i1", "trajectory_id": "long", "messages": messages(25)},
        ]
        report = source_lock.exact_join(swe, oh)
        output = MODULE.build_inventory(swe, oh, report)
        task = output["candidates"]["moto"]["tasks"][0]
        self.assertEqual(task["message_count"], 25)
        self.assertEqual(task["trajectory_row"], 1)
        self.assertEqual(task["problem_title"], "First title")
        self.assertEqual(task["patch_touched_files"], ["moto/foo.py"])
        self.assertEqual(task["test_files"], ["tests/test_foo.py"])
        self.assertEqual(output["candidates"]["moto"]["stats"]["created_at_month"], {"2024-02": 1})
        with self.assertRaises(MODULE.InventoryError):
            MODULE._assert_compact({"problem_statement": "must not leak"})

    def test_inventory_rejects_fail_closed_join_without_override(self):
        swe = [{"instance_id": "i1", "repo": "getmoto/moto", "base_commit": "a"}]
        oh = [{"messages": messages(2)}]
        report = source_lock.exact_join(swe, oh)
        with self.assertRaises(MODULE.InventoryError):
            MODULE.build_inventory(swe, oh, report)


if __name__ == "__main__":
    unittest.main()
