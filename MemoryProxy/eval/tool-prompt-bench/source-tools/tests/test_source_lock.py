import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("d0_source_lock", ROOT / "source_lock.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class SourceLockTests(unittest.TestCase):
    def load(self, name):
        rows, metadata = MODULE.load_rows(str(ROOT / "tests" / "fixtures" / name))
        return rows, metadata

    def test_join_is_fail_closed_without_official_task_id(self):
        swe, _ = self.load("swe-gym.json")
        openhands, _ = self.load("openhands-no-id.json")
        report = MODULE.exact_join(swe, openhands)
        self.assertTrue(report["fail_closed"])
        self.assertEqual(report["summary"]["matched"], 0)
        self.assertEqual(report["records"][0]["reason"], "problem_statement_not_in_swe_gym")
        self.assertNotIn("source_task_hash", report["records"][0])

    def test_unique_exact_problem_statement_fallback_recovers_official_id(self):
        swe, _ = self.load("swe-gym-problem.json")
        openhands, _ = self.load("openhands-problem.json")
        report = MODULE.exact_join(swe, openhands, exclude_ambiguous=True)
        first, second = report["records"]
        self.assertEqual(first["status"], "matched")
        self.assertEqual(first["join_method"], "exact_problem_statement")
        self.assertEqual(first["matched_field"], "problem_statement")
        self.assertEqual(first["official_instance_id"], "problem-1")
        self.assertEqual(len(first["extracted_problem_statement_sha256"]), 64)
        self.assertEqual(second["status"], "ambiguous")
        self.assertEqual(second["reason"], "duplicate_problem_statement_in_swe_gym")
        self.assertEqual(report["summary"]["missing_openhands_source_task_id"], 2)
        self.assertIsNone(first["openhands_source_task_id"])
        self.assertEqual(first["source_task_id"], "problem-1")
        self.assertTrue(report["fail_closed"] is False)

    def test_ambiguous_fallback_requires_explicit_exclusion(self):
        swe, _ = self.load("swe-gym-problem.json")
        openhands, _ = self.load("openhands-problem.json")
        report = MODULE.exact_join(swe, openhands)
        self.assertTrue(report["fail_closed"])
        self.assertFalse(report["exclude_ambiguous"])

    def test_exact_join_distinguishes_matched_and_ambiguous(self):
        swe, _ = self.load("swe-gym.json")
        openhands, _ = self.load("openhands.json")
        report = MODULE.exact_join(swe, openhands)
        # One row has no official task ID, so the whole admission result is
        # fail-closed even though the report still exposes exact statuses for
        # the other rows.
        self.assertTrue(report["fail_closed"])
        self.assertEqual(report["summary"]["matched"], 1)
        self.assertEqual(report["summary"]["ambiguous"], 1)
        self.assertEqual(report["summary"]["unmatched"], 1)
        statuses = [record["status"] for record in report["records"]]
        self.assertEqual(statuses, ["matched", "ambiguous", "unmatched"])

    def test_density_only_uses_exact_matches_and_records_hash(self):
        swe, swe_meta = self.load("swe-gym.json")
        openhands, openhands_meta = self.load("openhands.json")
        report = MODULE.exact_join(swe, openhands)
        density = MODULE.trajectory_density(report)
        self.assertEqual(
            density["repos"]["getmoto/moto"]["successful_matched_trajectories"], 1
        )
        self.assertEqual(density["repos"]["python/mypy"]["unique_source_tasks"], 0)
        self.assertEqual(swe_meta["row_count"], 3)
        self.assertEqual(len(swe_meta["file_sha256"]), 64)
        self.assertEqual(len(openhands_meta["file_sha256"]), 64)

    def test_dataset_server_row_wrapper_is_unwrapped(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "rows.json"
            path.write_text(
                json.dumps({"rows": [{"row": {"instance_id": "x"}, "truncated_cells": []}]}),
                encoding="utf-8",
            )
            rows, _ = MODULE.load_rows(str(path))
            self.assertEqual(rows, [{"instance_id": "x"}])

    def test_cli_dry_run_does_not_write_reports(self):
        with tempfile.TemporaryDirectory() as temp:
            result = MODULE.main(
                [
                    "build",
                    "--swe-gym",
                    str(ROOT / "tests" / "fixtures" / "swe-gym.json"),
                    "--openhands",
                    str(ROOT / "tests" / "fixtures" / "openhands-no-id.json"),
                    "--output-dir",
                    temp,
                    "--dry-run",
                ]
            )
            self.assertEqual(result, 0)
            self.assertEqual(list(Path(temp).iterdir()), [])

    def test_build_writes_all_three_reports(self):
        with tempfile.TemporaryDirectory() as temp:
            result = MODULE.main(
                [
                    "build",
                    "--swe-gym",
                    str(ROOT / "tests" / "fixtures" / "swe-gym.json"),
                    "--openhands",
                    str(ROOT / "tests" / "fixtures" / "openhands.json"),
                    "--output-dir",
                    temp,
                ]
            )
            self.assertEqual(result, 3)
            names = {path.name for path in Path(temp).iterdir()}
            self.assertEqual(
                names, {"source-lock.yaml", "trajectory-density.json", "join-report.json"}
            )
            lock = (Path(temp) / "source-lock.yaml").read_text(encoding="utf-8")
            self.assertIn(MODULE.SWE_GYM_REVISION, lock)
            self.assertIn("file_sha256:", lock)
            report = json.loads((Path(temp) / "join-report.json").read_text(encoding="utf-8"))
            self.assertEqual(report["summary"]["matched"], 1)

    def test_expected_lock_verifies_computed_bytes_and_rows(self):
        swe, swe_meta = self.load("swe-gym.json")
        openhands, openhands_meta = self.load("openhands.json")
        lock = MODULE.source_lock(
            swe_meta,
            openhands_meta,
            MODULE.SWE_GYM_REVISION,
            MODULE.OPENHANDS_REVISION,
            MODULE.OPENHANDS_SPLIT,
            False,
        )
        for dataset in lock["datasets"]:
            self.assertIn(dataset["revision"], dataset["canonical_locator"])
            self.assertIn("local_input", dataset)
        with tempfile.TemporaryDirectory() as temp:
            expected_path = Path(temp) / "expected.json"
            expected_path.write_text(
                json.dumps({
                    "datasets": [
                        {
                            "id": "SWE-Gym/SWE-Gym",
                            "revision": MODULE.SWE_GYM_REVISION,
                            "file_sha256": swe_meta["file_sha256"],
                            "row_count": 3,
                        },
                        {
                            "id": "SWE-Gym/OpenHands-SFT-Trajectories",
                            "revision": MODULE.OPENHANDS_REVISION,
                            "file_sha256": openhands_meta["file_sha256"],
                            "row_count": 3,
                        },
                    ]
                }),
                encoding="utf-8",
            )
            MODULE.verify_expected_lock(lock, str(expected_path))
            broken = json.loads(expected_path.read_text(encoding="utf-8"))
            broken["datasets"][0]["row_count"] = 999
            expected_path.write_text(json.dumps(broken), encoding="utf-8")
            with self.assertRaises(MODULE.SourceInputError):
                MODULE.verify_expected_lock(lock, str(expected_path))

    def test_density_uses_longest_trajectory_per_official_task(self):
        swe = [
            {"instance_id": "i1", "repo": "getmoto/moto", "base_commit": "a"},
            {"instance_id": "i2", "repo": "getmoto/moto", "base_commit": "b"},
        ]
        def messages(count):
            return [{"role": "user", "content": str(index)} for index in range(count)]
        openhands = [
            {"instance_id": "i1", "trajectory_id": "short", "messages": messages(2)},
            {"instance_id": "i1", "trajectory_id": "long", "messages": messages(25)},
            {"instance_id": "i2", "trajectory_id": "other", "messages": messages(20)},
        ]
        report = MODULE.exact_join(swe, openhands)
        density = MODULE.trajectory_density(report)
        stats = density["repos"]["getmoto/moto"]["eligible"]
        self.assertEqual(stats["unique_source_tasks"], 2)
        self.assertEqual(stats["selected_longest_trajectory_per_task"], 2)
        self.assertEqual(stats["top_six_message_counts"], [25, 20])


if __name__ == "__main__":
    unittest.main()
