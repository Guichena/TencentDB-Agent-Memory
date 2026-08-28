import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location("d0_source_pack", ROOT / "build_source_pack.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class SourcePackTests(unittest.TestCase):
    def fixture(self):
        repos = [
            ("W01", "A", "getmoto/moto"),
            ("W01", "B", "python/mypy"),
            ("W02", "A", "pandas-dev/pandas"),
            ("W02", "B", "dask/dask"),
            ("W03", "A", "iterative/dvc"),
            ("W03", "B", "Project-MONAI/MONAI"),
        ]
        tasks = []
        lines = ["# selection"]
        for world, team, repo in repos:
            lines += [
                f"## {world} Team {team} — {repo}",
                "| Role | instance_id / base_commit | Title | Msg | Touched files | Rationale |",
                "| --- | --- | --- | ---: | --- | --- |",
            ]
            for role in ("history", "current_anchor"):
                for index in range(6):
                    task_id = f"{world}-{team}-{role}-{index}"
                    commit = (str(len(tasks) + 1)[-1] * 40)
                    task = {
                        "repo": repo,
                        "instance_id": task_id,
                        "base_commit": commit,
                        "created_at": "2024-01-01 00:00:00",
                        "problem_title": "Title",
                        "problem_statement_sha256": f"{len(tasks) + 1:064x}",
                        "trajectory_row": len(tasks),
                        "message_count": 20,
                        "patch_touched_files": [f"{repo.split('/')[-1]}/file{len(tasks)}.py"],
                        "test_files": [],
                        "join_method": "exact_problem_statement",
                    }
                    tasks.append(task)
                    lines.append(
                        f"| {role} | `{task_id}` / `{commit}` | Title | 20 | `{task['patch_touched_files'][0]}` | okay |"
                    )
        inventory = {"candidates": {"fixture": {"tasks": tasks}}}
        return "\n".join(lines) + "\n", inventory

    def test_compiles_72_rows_and_verifies_inventory_fields(self):
        selection, inventory = self.fixture()
        output = MODULE.compile_source_pack(selection, inventory, "selection.md", "inventory.json")
        self.assertEqual(output["selected_count"], 72)
        self.assertEqual(output["history_count"], 36)
        self.assertEqual(output["current_anchor_count"], 36)
        self.assertEqual(len(output["teams"]), 6)
        self.assertEqual(len(output["selected"]), 72)
        self.assertEqual(output["selected"][0]["problem_statement_sha256"], f"{1:064x}")

    def test_markdown_mismatch_fails_closed(self):
        selection, inventory = self.fixture()
        selection = selection.replace("| Title | 20 |", "| Title | 21 |", 1)
        with self.assertRaises(MODULE.SourcePackError):
            MODULE.compile_source_pack(selection, inventory, "selection.md", "inventory.json")

    def test_machine_gate_rejects_heading_repo_mismatch(self):
        selection, inventory = self.fixture()
        selection = selection.replace("## W01 Team A — getmoto/moto", "## W01 Team A — wrong/repo", 1)
        with self.assertRaises(MODULE.SourcePackError):
            MODULE.compile_source_pack(selection, inventory, "selection.md", "inventory.json")


if __name__ == "__main__":
    unittest.main()
