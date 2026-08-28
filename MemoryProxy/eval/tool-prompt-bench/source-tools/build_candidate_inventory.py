#!/usr/bin/env python3
"""Build compact W01-W03 candidate inventory from an eligible D0 join report."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import source_lock


TARGET_LABELS = {
    "moto": ("getmoto/moto",),
    "mypy": ("python/mypy",),
    "pandas": ("pandas-dev/pandas",),
    "dask": ("dask/dask",),
    "dvc": ("iterative/dvc",),
    "MONAI": ("Project-MONAI/MONAI", "project-monai/monai"),
    "conan": ("conan-io/conan",),
    "pydantic": ("pydantic/pydantic",),
}
TARGET_REPO_NAMES = {name for names in TARGET_LABELS.values() for name in names}
PATCH_PATH_RE = re.compile(r"^diff --git a/(.*?) b/(.*?)$", re.MULTILINE)
PLUS_PATH_RE = re.compile(r"^\+\+\+ b/(.*?)$", re.MULTILINE)
MINUS_PATH_RE = re.compile(r"^--- a/(.*?)$", re.MULTILINE)
FORBIDDEN_KEYS = {
    "problem_statement",
    "patch",
    "test_patch",
    "messages",
    "trajectory",
    "hints_text",
}


class InventoryError(ValueError):
    pass


def _normalize_problem(value: Any) -> str:
    normalized = source_lock.normalize_problem_statement(value)
    return normalized or ""


def _title(problem: str, limit: int) -> str:
    first = next((line.strip() for line in problem.split("\n") if line.strip()), "")
    if len(first) <= limit:
        return first
    return first[: max(0, limit - 1)].rstrip() + "…"


def _touched_files(patch: Any) -> list[str]:
    if not isinstance(patch, str):
        return []
    paths: list[str] = []
    seen: set[str] = set()
    for left, right in PATCH_PATH_RE.findall(patch):
        for path in (left, right):
            if path != "/dev/null" and path not in seen:
                seen.add(path)
                paths.append(path)
    # Some diff producers omit the diff --git header; retain file paths from
    # the standard +/- headers without exposing patch contents.
    for path in PLUS_PATH_RE.findall(patch) + MINUS_PATH_RE.findall(patch):
        if path != "/dev/null" and path not in seen:
            seen.add(path)
            paths.append(path)
    return paths


def _module(path: str) -> str:
    parts = path.replace("\\", "/").split("/")
    if not parts or not parts[0]:
        return "<root>"
    return parts[0]


def _time_bucket(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        return "unknown"
    match = re.match(r"^(\d{4})[-/]?(\d{2})", value.strip())
    return f"{match.group(1)}-{match.group(2)}" if match else value[:10]


def _length_bucket(value: int) -> str:
    if value < 20:
        return "0-19"
    if value < 40:
        return "20-39"
    if value < 60:
        return "40-59"
    if value < 80:
        return "60-79"
    return "80+"


def _stats(tasks: list[dict[str, Any]]) -> dict[str, Any]:
    lengths = [int(task["message_count"]) for task in tasks]
    modules = Counter(module for task in tasks for module in task["patch_touched_modules"])
    time = Counter(task["created_at_month"] for task in tasks)
    length_buckets = Counter(_length_bucket(length) for length in lengths)
    return {
        "selected_task_count": len(tasks),
        "message_count": {
            "min": min(lengths) if lengths else 0,
            "median": statistics.median(lengths) if lengths else 0,
            "max": max(lengths) if lengths else 0,
            "total": sum(lengths),
            "at_least_20": sum(length >= 20 for length in lengths),
        },
        "modules": dict(sorted(modules.items())),
        "created_at_month": dict(sorted(time.items())),
        "message_length_buckets": dict(sorted(length_buckets.items())),
    }


def _label_for_repo(repo: str) -> str | None:
    for label, names in TARGET_LABELS.items():
        if repo in names:
            return label
    return None


def _assert_compact(value: Any, path: str = "root") -> None:
    if isinstance(value, dict):
        forbidden = FORBIDDEN_KEYS.intersection(value)
        if forbidden:
            raise InventoryError(f"full source payload field leaked into inventory at {path}: {sorted(forbidden)}")
        for key, child in value.items():
            _assert_compact(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _assert_compact(child, f"{path}[{index}]")


def build_inventory(
    swe_rows: list[dict[str, Any]],
    openhands_rows: list[dict[str, Any]],
    join_report: dict[str, Any],
    title_limit: int = 160,
    allow_fail_closed: bool = False,
) -> dict[str, Any]:
    if join_report.get("fail_closed") and not allow_fail_closed:
        raise InventoryError("join report is fail-closed; use --allow-fail-closed only for audit output")
    records = join_report.get("records")
    if not isinstance(records, list):
        raise InventoryError("join report has no records list")

    task_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    raw_counts: Counter[str] = Counter()
    for record in records:
        if not isinstance(record, dict) or record.get("status") != "matched":
            continue
        if not record.get("eligible"):
            continue
        task_id = record.get("official_instance_id") or record.get("source_task_id")
        repo = record.get("repo")
        row_index = record.get("swe_gym_row")
        trajectory_row = record.get("trajectory_row")
        if not isinstance(task_id, str) or not task_id:
            raise InventoryError("eligible matched record has no official instance_id")
        if not isinstance(repo, str) or not repo:
            raise InventoryError(f"eligible task {task_id} has no repo")
        if repo not in TARGET_REPO_NAMES:
            # The W01-W03 inventory is intentionally scoped to the requested
            # candidate set; other SWE-Gym repos remain in the join report.
            continue
        if not isinstance(row_index, int) or not isinstance(trajectory_row, int):
            raise InventoryError(f"eligible task {task_id} has invalid source row indexes")
        task_rows[task_id].append(record)
        raw_counts[repo] += 1

    selected: list[dict[str, Any]] = []
    for task_id, task_records in task_rows.items():
        record = min(
            task_records,
            key=lambda item: (-int(item.get("message_count", 0)), int(item["trajectory_row"])),
        )
        swe_index = int(record["swe_gym_row"])
        if swe_index < 0 or swe_index >= len(swe_rows):
            raise InventoryError(f"SWE-Gym row index out of range for {task_id}: {swe_index}")
        if record["trajectory_row"] < 0 or record["trajectory_row"] >= len(openhands_rows):
            raise InventoryError(f"OpenHands row index out of range for {task_id}")
        task = swe_rows[swe_index]
        official_id = task.get("instance_id")
        if official_id != task_id:
            raise InventoryError(f"join report task mismatch at SWE-Gym row {swe_index}: {task_id!r} != {official_id!r}")
        if not isinstance(task.get("base_commit"), str) or not task["base_commit"]:
            raise InventoryError(f"SWE-Gym task {task_id} has no base_commit")
        problem = _normalize_problem(task.get("problem_statement"))
        if not problem:
            raise InventoryError(f"SWE-Gym task {task_id} has no problem_statement")
        patch_files = _touched_files(task.get("patch"))
        test_files = _touched_files(task.get("test_patch"))
        item = {
            "repo": record["repo"],
            "instance_id": task_id,
            "base_commit": task.get("base_commit"),
            "created_at": task.get("created_at"),
            "created_at_month": _time_bucket(task.get("created_at")),
            "problem_title": _title(problem, title_limit),
            "patch_touched_files": patch_files,
            "patch_touched_modules": sorted({_module(path) for path in patch_files}),
            "test_files": test_files,
            "message_count": int(record.get("message_count", 0)),
            "trajectory_row": int(record["trajectory_row"]),
            "problem_statement_sha256": hashlib.sha256(problem.encode("utf-8")).hexdigest(),
            "join_method": record.get("join_method"),
        }
        selected.append(item)

    selected.sort(key=lambda item: (item["repo"], item["instance_id"]))
    by_repo: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in selected:
        by_repo[item["repo"]].append(item)

    candidates: dict[str, Any] = {}
    for label, names in TARGET_LABELS.items():
        matching_repos = [repo for repo in by_repo if repo in names]
        tasks = [item for repo in matching_repos for item in by_repo[repo]]
        candidates[label] = {
            "repos": matching_repos,
            "raw_eligible_trajectory_count": sum(raw_counts[repo] for repo in matching_repos),
            "selected_longest_task_count": len(tasks),
            "stats": _stats(tasks),
            "tasks": tasks,
        }

    output = {
        "schema_version": "d0-candidate-inventory-v1",
        "selection_policy": "join-report eligible records; one longest successful trajectory per official instance_id",
        "payload_policy": "compact metadata only; no complete problem, patch, test_patch, messages, or trajectory",
        "gold_policy": "inventory only; Gold, pair role, and task admission remain manual",
        "candidates": candidates,
        "all_selected_tasks": len(selected),
    }
    _assert_compact(output)
    return output


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--swe-gym", required=True)
    parser.add_argument("--openhands", required=True)
    parser.add_argument("--join-report", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--title-limit", type=int, default=160)
    parser.add_argument("--allow-fail-closed", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        swe_rows, _ = source_lock.load_rows(args.swe_gym)
        openhands_rows, _ = source_lock.load_rows(args.openhands)
        join_report = json.loads(Path(args.join_report).read_text(encoding="utf-8"))
        output = build_inventory(
            swe_rows,
            openhands_rows,
            join_report,
            title_limit=args.title_limit,
            allow_fail_closed=args.allow_fail_closed,
        )
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, json.JSONDecodeError, source_lock.SourceInputError, InventoryError) as exc:
        print(f"D0 candidate-inventory error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "output": str(Path(args.output)),
        "all_selected_tasks": output["all_selected_tasks"],
        "candidates": {
            label: value["selected_longest_task_count"]
            for label, value in output["candidates"].items()
        },
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
