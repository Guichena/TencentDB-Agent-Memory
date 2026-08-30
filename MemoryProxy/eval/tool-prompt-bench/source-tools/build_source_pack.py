#!/usr/bin/env python3
"""Compile the selected W01-W03 source-pack rows from Markdown and inventory."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


class SourcePackError(ValueError):
    pass


ROW_RE = re.compile(r"^\|\s*(history|current_anchor)\s*\|\s*(.*?)\s*\|", re.IGNORECASE)
HEADING_RE = re.compile(r"^##\s+W(\d+)\s+Team\s+([AB])\s+[—-]\s*(.*?)\s*$")
ID_COMMIT_RE = re.compile(r"^`([^`]+)`\s*/\s*`([^`]+)`$")
HEX40_RE = re.compile(r"^[0-9a-f]{40}$")
HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
EXPECTED_TEAMS = {
    "W01-Team-A": "getmoto/moto",
    "W01-Team-B": "python/mypy",
    "W02-Team-A": "pandas-dev/pandas",
    "W02-Team-B": "dask/dask",
    "W03-Team-A": "iterative/dvc",
    "W03-Team-B": "Project-MONAI/MONAI",
}


def _strip_code(value: str) -> str:
    return value.strip().strip("`").strip()


def parse_selection(markdown: str) -> list[dict[str, Any]]:
    current: dict[str, Any] | None = None
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(markdown.splitlines(), 1):
        heading = HEADING_RE.match(line.strip())
        if heading:
            current = {
                "world": f"W{heading.group(1).zfill(2)}",
                "team": heading.group(2),
                "team_label": heading.group(3).strip(),
            }
            continue
        row_match = ROW_RE.match(line)
        if not row_match or current is None:
            continue
        cells = [cell.strip() for cell in line.split("|")[1:-1]]
        if len(cells) < 5:
            raise SourcePackError(f"selection row has too few cells at line {line_number}")
        match = ID_COMMIT_RE.match(cells[1])
        if match is None:
            raise SourcePackError(f"invalid instance_id/base_commit cell at line {line_number}")
        role = row_match.group(1).lower()
        rows.append({
            **current,
            "role": role,
            "instance_id": match.group(1),
            "base_commit": match.group(2),
            "markdown_title": _strip_code(cells[2]),
            "markdown_message_count": int(cells[3]),
            "markdown_touched_files": [
                _strip_code(part.strip())
                for part in cells[4].split(",")
                if part.strip()
            ],
            "markdown_line": line_number,
        })
    return rows


def _candidate_for_team(label: str) -> str | None:
    normalized = label.lower()
    for candidate_label, names in {
        "moto": ("getmoto/moto",),
        "mypy": ("python/mypy",),
        "pandas": ("pandas-dev/pandas",),
        "dask": ("dask/dask",),
        "dvc": ("iterative/dvc",),
        "MONAI": ("project-monai/monai",),
    }.items():
        if any(name.lower() in normalized for name in names):
            return candidate_label
    return None


def _task_index(inventory: dict[str, Any]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for candidate in inventory.get("candidates", {}).values():
        for task in candidate.get("tasks", []):
            instance_id = task.get("instance_id")
            if not isinstance(instance_id, str) or instance_id in index:
                raise SourcePackError(f"duplicate or invalid inventory instance_id: {instance_id!r}")
            index[instance_id] = task
    return index


def compile_source_pack(
    selection_text: str,
    inventory: dict[str, Any],
    selection_locator: str,
    inventory_locator: str,
) -> dict[str, Any]:
    selections = parse_selection(selection_text)
    if len(selections) != 72:
        raise SourcePackError(f"expected 72 selected rows, found {len(selections)}")
    index = _task_index(inventory)
    selected_ids = set()
    teams: dict[str, dict[str, Any]] = defaultdict(lambda: {"history": [], "current_anchor": []})
    compiled: list[dict[str, Any]] = []
    for order, selection in enumerate(selections, 1):
        instance_id = selection["instance_id"]
        if instance_id in selected_ids:
            raise SourcePackError(f"instance_id selected more than once: {instance_id}")
        selected_ids.add(instance_id)
        task = index.get(instance_id)
        if task is None:
            raise SourcePackError(f"selection instance_id absent from inventory: {instance_id}")
        team_key = f"{selection['world']}-Team-{selection['team']}"
        expected_repo = EXPECTED_TEAMS.get(team_key)
        if expected_repo is None:
            raise SourcePackError(f"unexpected team: {team_key}")
        if selection["team_label"].strip().lower() != expected_repo.lower():
            raise SourcePackError(f"Markdown heading repo mismatch for {team_key}: {selection['team_label']!r}")
        if str(task.get("repo", "")).lower() != expected_repo.lower():
            raise SourcePackError(f"inventory repo mismatch for {instance_id}")
        if task.get("base_commit") != selection["base_commit"]:
            raise SourcePackError(f"base_commit mismatch for {instance_id}")
        if not isinstance(task.get("base_commit"), str) or HEX40_RE.fullmatch(task["base_commit"]) is None:
            raise SourcePackError(f"invalid 40-hex base_commit for {instance_id}")
        problem_hash = task.get("problem_statement_sha256")
        if not isinstance(problem_hash, str) or HEX64_RE.fullmatch(problem_hash) is None:
            raise SourcePackError(f"invalid 64-hex problem hash for {instance_id}")
        if int(task.get("message_count", -1)) < 20:
            raise SourcePackError(f"message_count below 20 for {instance_id}")
        if int(task.get("message_count", -1)) != selection["markdown_message_count"]:
            raise SourcePackError(f"message_count mismatch for {instance_id}")
        inventory_files = task.get("patch_touched_files", [])
        selected_files = selection["markdown_touched_files"]
        if set(selected_files) != set(inventory_files):
            raise SourcePackError(f"touched-file mismatch for {instance_id}")
        compiled_task = {
            "selection_order": order,
            "world": selection["world"],
            "team": selection["team"],
            "role": selection["role"],
            "instance_id": instance_id,
            "repo": task.get("repo"),
            "base_commit": task.get("base_commit"),
            "created_at": task.get("created_at"),
            "problem_title": task.get("problem_title"),
            "problem_statement_sha256": task.get("problem_statement_sha256"),
            "trajectory_row": task.get("trajectory_row"),
            "message_count": task.get("message_count"),
            "patch_touched_files": task.get("patch_touched_files", []),
            "test_files": task.get("test_files", []),
            "join_method": task.get("join_method"),
        }
        compiled.append(compiled_task)
        teams[team_key][selection["role"]].append(compiled_task)

    if set(teams) != set(EXPECTED_TEAMS):
        raise SourcePackError(f"expected exactly teams {sorted(EXPECTED_TEAMS)}, found {sorted(teams)}")
    for team_key, grouped in teams.items():
        if len(grouped["history"]) != 6 or len(grouped["current_anchor"]) != 6:
            raise SourcePackError(f"{team_key} must have six history and six current_anchor tasks")
        team_tasks = grouped["history"] + grouped["current_anchor"]
        if len(team_tasks) != 12:
            raise SourcePackError(f"{team_key} must have 12 tasks")
        if len({task["instance_id"] for task in team_tasks}) != 12:
            raise SourcePackError(f"{team_key} has overlapping task IDs")
        if len({task["problem_statement_sha256"] for task in team_tasks}) != 12:
            raise SourcePackError(f"{team_key} has duplicate problem hashes")
        touched = [path for task in team_tasks for path in task["patch_touched_files"]]
        if len(set(touched)) != len(touched):
            raise SourcePackError(f"{team_key} has duplicate patch-touched file paths")
    output = {
        "schema_version": "d0-source-pack-selection-v1",
        "selection_policy": "compiled from final Markdown selection and verified against candidate inventory",
        "payload_policy": "metadata only; no full problem, patch, test_patch, messages, or Gold",
        "selection_source": {
            "locator": selection_locator,
            "sha256": hashlib.sha256(selection_text.encode("utf-8")).hexdigest(),
        },
        "inventory_source": {
            "locator": inventory_locator,
            "sha256": hashlib.sha256(
                json.dumps(inventory, ensure_ascii=False, sort_keys=True).encode("utf-8")
            ).hexdigest(),
        },
        "selected_count": len(compiled),
        "history_count": sum(task["role"] == "history" for task in compiled),
        "current_anchor_count": sum(task["role"] == "current_anchor" for task in compiled),
        "teams": dict(sorted(teams.items())),
        "selected": compiled,
    }
    return output


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selection", required=True)
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--output", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        selection_path = Path(args.selection)
        inventory_path = Path(args.inventory)
        selection_text = selection_path.read_text(encoding="utf-8")
        inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
        output = compile_source_pack(
            selection_text,
            inventory,
            str(selection_path),
            str(inventory_path),
        )
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, json.JSONDecodeError, SourcePackError, ValueError) as exc:
        print(f"D0 source-pack error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "output": str(Path(args.output)),
        "selected_count": output["selected_count"],
        "history_count": output["history_count"],
        "current_anchor_count": output["current_anchor_count"],
        "teams": sorted(output["teams"]),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
