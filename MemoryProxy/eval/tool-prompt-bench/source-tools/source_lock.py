#!/usr/bin/env python3
"""D0 source lock and exact source-task join.

The tool first uses an explicit official task identifier when one exists.
OpenHands-SFT currently omits that field, so the only allowed fallback is a
global unique, exact match between the complete ``<pr_description>`` in the
first user message and SWE-Gym's normalized ``problem_statement``.  Ambiguous
descriptions are never resolved by fuzzy text, repository paths, or hashes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


SWE_GYM_REVISION = "bb94ed9e39bbeb96a7fcbfb533b80f25a7fd59cb"
OPENHANDS_REVISION = "4aaa5a4a4b5861f4799d2336908760c190ac3b17"
OPENHANDS_SPLIT = "train.success.oss"
SWE_GYM_CANONICAL_URL = (
    "https://huggingface.co/datasets/SWE-Gym/SWE-Gym/resolve/"
    f"{SWE_GYM_REVISION}/data/train-00000-of-00001.parquet"
)
OPENHANDS_CANONICAL_URL = (
    "https://huggingface.co/datasets/SWE-Gym/OpenHands-SFT-Trajectories/resolve/"
    f"{OPENHANDS_REVISION}/data/train.success.oss-00000-of-00001.parquet"
)
TARGET_REPOS = (
    "getmoto/moto",
    "python/mypy",
    "pandas-dev/pandas",
    "dask/dask",
    "iterative/dvc",
    "Project-MONAI/MONAI",
    "conan-io/conan",
    "pydantic/pydantic",
)
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


class SourceInputError(ValueError):
    """Raised when an input cannot be admitted under the D0 contract."""


def _is_url(value: str) -> bool:
    return urllib.parse.urlparse(value).scheme in {"http", "https"}


def _read_bytes(spec: str, allow_download: bool) -> bytes:
    if _is_url(spec):
        if not allow_download:
            raise SourceInputError(
                f"refusing URL input without --allow-download: {spec}"
            )
        request = urllib.request.Request(
            spec, headers={"User-Agent": "tdai-proxybench-d0-source-lock/1"}
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.read()
    path = Path(spec)
    if not path.is_file():
        raise SourceInputError(f"input is not a file: {spec}")
    return path.read_bytes()


def _unwrap_row(value: Any) -> Any:
    # Dataset-server rows also carry metadata such as ``truncated_cells``.
    if isinstance(value, dict) and isinstance(value.get("row"), dict):
        return value["row"]
    return value


def _parse_payload(payload: bytes, spec: str) -> tuple[list[dict[str, Any]], str]:
    suffix = Path(urllib.parse.urlparse(spec).path).suffix.lower()
    if suffix == ".parquet":
        try:
            import pyarrow.parquet as parquet  # type: ignore
        except ImportError as exc:
            raise SourceInputError(
                "parquet input requires optional pyarrow; export JSON/JSONL instead"
            ) from exc
        # pyarrow accepts a file-like object and avoids creating a second source
        # artifact.  This path is optional so the default runtime stays light.
        import io

        table = parquet.read_table(io.BytesIO(payload))
        records = table.to_pylist()
        return [dict(record) for record in records], "parquet"

    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise SourceInputError(f"input is not UTF-8 JSON/JSONL: {spec}") from exc

    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            values = parsed
        elif isinstance(parsed, dict):
            # Dataset-server exports use {"rows": [{"row": {...}}]}; local
            # exports commonly use {"data": [...]} or a split-named list.
            values = None
            for key in ("rows", "data", OPENHANDS_SPLIT, "train"):
                if isinstance(parsed.get(key), list):
                    values = parsed[key]
                    break
            if values is None:
                values = [parsed]
        else:
            raise SourceInputError("JSON root must be an object or array")
        format_name = "json"
    except json.JSONDecodeError:
        values = []
        for line_number, line in enumerate(text.splitlines(), 1):
            if not line.strip():
                continue
            try:
                values.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise SourceInputError(
                    f"invalid JSONL at line {line_number} in {spec}"
                ) from exc
        format_name = "jsonl"

    rows = [_unwrap_row(value) for value in values]
    if not all(isinstance(row, dict) for row in rows):
        raise SourceInputError(f"every row must be an object: {spec}")
    return [dict(row) for row in rows], format_name


def load_rows(spec: str, allow_download: bool = False) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    payload = _read_bytes(spec, allow_download)
    rows, format_name = _parse_payload(payload, spec)
    fields = sorted({key for row in rows for key in row.keys()})
    return rows, {
        "locator": spec,
        "format": format_name,
        "file_sha256": hashlib.sha256(payload).hexdigest(),
        "byte_count": len(payload),
        "row_count": len(rows),
        "fields": fields,
    }


def _official_id(row: dict[str, Any], names: tuple[str, ...]) -> tuple[str | None, str | None]:
    """Return only an explicitly named ID field; no textual fallback is allowed."""
    for name in names:
        value = row.get(name)
        if isinstance(value, str) and value.strip():
            return value.strip(), name
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return str(value), name
    return None, None


def _success(row: dict[str, Any], split: str) -> bool:
    if "resolved" not in row:
        return split == OPENHANDS_SPLIT
    value = row["resolved"]
    return value is True or value == 1 or str(value).lower() in {"1", "true", "success", "resolved"}


def _content_present(content: Any) -> bool:
    if content is None:
        return False
    if isinstance(content, str):
        return bool(content.strip())
    if isinstance(content, (list, dict)):
        return bool(json.dumps(content, ensure_ascii=False).strip())
    return bool(str(content).strip())


def message_count(row: dict[str, Any]) -> int:
    messages = row.get("messages")
    if messages is None:
        messages = row.get("trajectory")
    if not isinstance(messages, list):
        return 0
    count = 0
    for message in messages:
        if isinstance(message, dict):
            if str(message.get("role", "")).lower() == "system":
                continue
            content = message.get("content", message)
        else:
            content = message
        if _content_present(content):
            count += 1
    return count


def _trajectory_id(row: dict[str, Any]) -> tuple[str | None, str | None]:
    return _official_id(row, ("trajectory_id", "trajectoryId"))


def normalize_problem_statement(value: Any) -> str | None:
    """Apply the documented exact-evidence normalization, never fuzzy matching."""
    if not isinstance(value, str):
        return None
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip() for line in value.split("\n")).strip()


def _message_text(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts) if parts else None
    return None


def extract_problem_statement(row: dict[str, Any]) -> tuple[str | None, str | None]:
    """Extract only <pr_description> from the first user message."""
    messages = row.get("messages")
    if not isinstance(messages, list):
        return None, None
    pattern = re.compile(r"<pr_description>(.*?)</pr_description>", re.IGNORECASE | re.DOTALL)
    for index, message in enumerate(messages):
        if not isinstance(message, dict) or str(message.get("role", "")).lower() != "user":
            continue
        content = _message_text(message.get("content"))
        if content is None:
            return None, f"messages[{index}].content"
        match = pattern.search(content)
        if match is None:
            return None, f"messages[{index}].content"
        return normalize_problem_statement(match.group(1)), f"messages[{index}].content.<pr_description>"
    return None, None


def _join_task_row(
    record: dict[str, Any],
    swe_index: int,
    task_row: dict[str, Any],
    join_method: str,
    matched_field: str,
) -> bool:
    official_id, official_field = _official_id(task_row, ("instance_id",))
    repo = task_row.get("repo")
    if official_id is None:
        record.update({"status": "unmatched", "reason": "matched_task_missing_official_instance_id"})
        return False
    if not isinstance(repo, str) or not repo.strip():
        record.update({"status": "unmatched", "reason": "matched_task_missing_repo"})
        return False
    record.update({
        "status": "matched",
        "eligible": True,
        "join_method": join_method,
        "matched_field": matched_field,
        "swe_gym_row": swe_index,
        "source_task_id": official_id,
        "source_task_id_field": official_field,
        "official_instance_id": official_id,
        "repo": repo.strip(),
        "base_commit": task_row.get("base_commit"),
    })
    return True


def exact_join(
    swe_rows: list[dict[str, Any]],
    openhands_rows: list[dict[str, Any]],
    split: str = OPENHANDS_SPLIT,
    row_limit: int | None = None,
    exclude_ambiguous: bool = False,
) -> dict[str, Any]:
    """Join trajectories by official ID, then unique exact problem evidence."""
    task_rows: dict[str, list[tuple[int, dict[str, Any]]]] = defaultdict(list)
    problem_rows: dict[str, list[tuple[int, dict[str, Any]]]] = defaultdict(list)
    task_id_fields: Counter[str] = Counter()
    for index, row in enumerate(swe_rows):
        task_id, field = _official_id(row, ("instance_id",))
        if task_id is not None:
            task_rows[task_id].append((index, row))
            task_id_fields[field or "unknown"] += 1
        problem = normalize_problem_statement(row.get("problem_statement"))
        if problem:
            problem_rows[problem].append((index, row))

    selected = openhands_rows if row_limit is None else openhands_rows[:row_limit]
    records: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()
    for index, row in enumerate(selected):
        trajectory_id, trajectory_id_field = _trajectory_id(row)
        task_id, task_id_field = _official_id(row, ("instance_id",))
        extracted_problem, extracted_field = extract_problem_statement(row)
        record: dict[str, Any] = {
            "trajectory_row": index,
            "trajectory_id": trajectory_id,
            "trajectory_id_field": trajectory_id_field,
            "openhands_source_task_id": task_id,
            "openhands_source_task_id_field": task_id_field,
            "source_task_id": task_id,
            "source_task_id_field": task_id_field,
            "message_count": message_count(row),
            "success": _success(row, split),
            "eligible": False,
        }
        if extracted_problem is not None:
            record.update({
                "extracted_problem_statement_sha256": hashlib.sha256(
                    extracted_problem.encode("utf-8")
                ).hexdigest(),
                "extracted_problem_statement_field": extracted_field,
            })
        if not record["success"]:
            record.update({"status": "unmatched", "reason": "not_success"})
            counts["unmatched"] += 1
        else:
            candidates: list[tuple[int, dict[str, Any]]] | None = None
            if task_id is not None:
                candidates = task_rows.get(task_id, [])
                if not candidates:
                    record.update({"status": "unmatched", "reason": "source_task_id_not_in_swe_gym"})
                elif len(candidates) != 1:
                    record.update({
                        "status": "ambiguous",
                        "reason": "duplicate_source_task_id_in_swe_gym",
                        "swe_gym_rows": [item[0] for item in candidates],
                    })
            elif extracted_problem is None:
                record.update({
                    "status": "unmatched",
                    "reason": "missing_official_source_task_id_and_problem_statement",
                })
            else:
                candidates = problem_rows.get(extracted_problem, [])
                if not candidates:
                    record.update({"status": "unmatched", "reason": "problem_statement_not_in_swe_gym"})
                elif len(candidates) != 1:
                    record.update({
                        "status": "ambiguous",
                        "reason": "duplicate_problem_statement_in_swe_gym",
                        "swe_gym_rows": [item[0] for item in candidates],
                        "candidate_instance_ids": [
                            _official_id(item[1], ("instance_id",))[0] for item in candidates
                        ],
                    })
            if candidates is not None and len(candidates) == 1:
                swe_index, task_row = candidates[0]
                if _join_task_row(
                    record,
                    swe_index,
                    task_row,
                    "official_id" if task_id is not None else "exact_problem_statement",
                    "instance_id" if task_id is not None else "problem_statement",
                ):
                    counts["matched"] += 1
            if record.get("status") == "ambiguous":
                counts["ambiguous"] += 1
            elif record.get("status") == "unmatched":
                counts["unmatched"] += 1
        records.append(record)

    missing_openhands_ids = sum(
        1
        for record in records
        if record["success"] and record["openhands_source_task_id_field"] is None
    )
    blocking_unmatched = sum(
        1
        for record in records
        if record["status"] == "unmatched" and record["reason"] != "not_success"
    )
    truncated = row_limit is not None and row_limit < len(openhands_rows)
    ambiguous_blocking = counts["ambiguous"] > 0 and not exclude_ambiguous
    fail_closed = (
        counts["matched"] == 0
        or ambiguous_blocking
        or blocking_unmatched > 0
        or truncated
    )
    return {
        "schema_version": "d0-join-report-v1",
        "join_policy": "official_id_then_unique_exact_problem_statement",
        "exclude_ambiguous": exclude_ambiguous,
        "fail_closed": fail_closed,
        "task_id_fields_in_swe_gym": dict(task_id_fields),
        "raw": {
            "rows_considered": len(selected),
            "matched": counts["matched"],
            "ambiguous": counts["ambiguous"],
            "unmatched": counts["unmatched"],
        },
        "eligible": {
            "matched": sum(
                1 for record in records if record.get("status") == "matched" and record.get("eligible")
            ),
            "ambiguous_excluded": counts["ambiguous"] if exclude_ambiguous else 0,
        },
        "summary": {
            "swe_gym_rows": len(swe_rows),
            "openhands_rows_considered": len(selected),
            "openhands_rows_not_considered": len(openhands_rows) - len(selected),
            "matched": counts["matched"],
            "ambiguous": counts["ambiguous"],
            "unmatched": counts["unmatched"],
            "eligible_matched": sum(
                1 for record in records if record.get("status") == "matched" and record.get("eligible")
            ),
            "missing_openhands_source_task_id": missing_openhands_ids,
            "blocking_unmatched": blocking_unmatched,
            "ambiguous_excluded": counts["ambiguous"] if exclude_ambiguous else 0,
            "analysis_truncated": truncated,
        },
        "records": records,
    }


def trajectory_density(join_report: dict[str, Any], target_repos: Iterable[str] = TARGET_REPOS) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in join_report["records"]:
        if record.get("status") == "matched":
            grouped[record["repo"]].append(record)

    output: dict[str, Any] = {
        "schema_version": "d0-trajectory-density-v1",
        "join_policy": join_report["join_policy"],
        "fail_closed": join_report["fail_closed"],
        "repos": {},
    }
    for repo in target_repos:
        raw_records = grouped.get(repo, [])
        eligible_records = [record for record in raw_records if record.get("eligible")]

        def stats(records: list[dict[str, Any]]) -> dict[str, Any]:
            by_task: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for record in records:
                by_task[record["source_task_id"]].append(record)
            # A source task contributes one trajectory: its longest successful
            # trajectory. This prevents duplicate successful replays inflating
            # the D0 six-task gate.
            best = [
                max(task_records, key=lambda record: record["message_count"])
                for task_records in by_task.values()
            ]
            counts = sorted((record["message_count"] for record in best), reverse=True)
            qualifying_tasks = sum(count >= 20 for count in counts)
            return {
                "successful_matched_trajectories": len(records),
                "unique_source_tasks": len(by_task),
                "selected_longest_trajectory_per_task": len(best),
                "unique_source_tasks_with_20_messages": qualifying_tasks,
                "trajectories_with_20_messages": sum(count >= 20 for count in counts),
                "top_six_message_counts": counts[:6],
                "top_six_total_messages": sum(counts[:6]),
            }

        raw = stats(raw_records)
        eligible = stats(eligible_records)
        output["repos"][repo] = {
            "raw": raw,
            "eligible": eligible,
            # Backward-compatible concise aliases refer to eligible records.
            "successful_matched_trajectories": eligible["successful_matched_trajectories"],
            "unique_source_tasks": eligible["unique_source_tasks"],
            "unique_source_tasks_with_20_messages": eligible["unique_source_tasks_with_20_messages"],
            "trajectories_with_20_messages": eligible["trajectories_with_20_messages"],
            "top_six_message_counts": eligible["top_six_message_counts"],
            "top_six_total_messages": eligible["top_six_total_messages"],
            "gate": {
                "join_report_fail_closed": join_report["fail_closed"],
                "at_least_six_source_tasks": eligible["unique_source_tasks_with_20_messages"] >= 6,
                "at_least_six_trajectories": eligible["trajectories_with_20_messages"] >= 6,
                "pass": (
                    not join_report["fail_closed"]
                    and eligible["unique_source_tasks_with_20_messages"] >= 6
                    and eligible["trajectories_with_20_messages"] >= 6
                ),
            },
        }
    return output


def _yaml_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return str(value)
    return json.dumps(str(value), ensure_ascii=False)


def _yaml_dump(value: Any, indent: int = 0) -> list[str]:
    prefix = " " * indent
    lines: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            if isinstance(child, (dict, list)) and child:
                lines.append(f"{prefix}{key}:")
                lines.extend(_yaml_dump(child, indent + 2))
            else:
                lines.append(f"{prefix}{key}: {_yaml_scalar(child)}")
    elif isinstance(value, list):
        for child in value:
            if isinstance(child, dict):
                first = True
                for key, nested in child.items():
                    if first:
                        if isinstance(nested, (dict, list)) and nested:
                            lines.append(f"{prefix}- {key}:")
                            lines.extend(_yaml_dump(nested, indent + 4))
                        else:
                            lines.append(f"{prefix}- {key}: {_yaml_scalar(nested)}")
                        first = False
                    elif isinstance(nested, (dict, list)) and nested:
                        lines.append(f"{' ' * (indent + 2)}{key}:")
                        lines.extend(_yaml_dump(nested, indent + 4))
                    else:
                        lines.append(f"{' ' * (indent + 2)}{key}: {_yaml_scalar(nested)}")
            else:
                lines.append(f"{prefix}- {_yaml_scalar(child)}")
    return lines


def source_lock(
    swe_meta: dict[str, Any],
    openhands_meta: dict[str, Any],
    swe_revision: str,
    openhands_revision: str,
    split: str,
    exclude_ambiguous: bool,
) -> dict[str, Any]:
    def portable_local_input(metadata: dict[str, Any]) -> str | None:
        locator = metadata.get("locator")
        if not isinstance(locator, str):
            return None
        return locator if _is_url(locator) else Path(locator).name

    return {
        "schema_version": "d0-source-lock-v1",
        "join_policy": "official_id_then_unique_exact_problem_statement",
        "download_policy": "no_implicit_download; URLs require --allow-download",
        "datasets": [
            {
                "id": "SWE-Gym/SWE-Gym",
                "url": "https://huggingface.co/datasets/SWE-Gym/SWE-Gym",
                "canonical_locator": SWE_GYM_CANONICAL_URL,
                "revision": swe_revision,
                "license": "MIT",
                "split": "train",
                "local_input": portable_local_input(swe_meta),
                **{key: value for key, value in swe_meta.items() if key != "locator"},
            },
            {
                "id": "SWE-Gym/OpenHands-SFT-Trajectories",
                "url": "https://huggingface.co/datasets/SWE-Gym/OpenHands-SFT-Trajectories",
                "canonical_locator": OPENHANDS_CANONICAL_URL,
                "revision": openhands_revision,
                "license": "MIT",
                "split": split,
                "local_input": portable_local_input(openhands_meta),
                **{key: value for key, value in openhands_meta.items() if key != "locator"},
            },
        ],
        "join_options": {"exclude_ambiguous": exclude_ambiguous},
    }


def _load_expected_lock(path: str) -> dict[str, Any]:
    payload = Path(path).read_bytes()
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        try:
            import yaml  # type: ignore
        except ImportError as exc:
            raise SourceInputError(
                "--expected-lock must be JSON, or YAML with optional PyYAML installed"
            ) from exc
        value = yaml.safe_load(payload.decode("utf-8"))
    if not isinstance(value, dict):
        raise SourceInputError("expected lock root must be an object")
    return value


def verify_expected_lock(lock: dict[str, Any], expected_path: str | None) -> None:
    if expected_path is None:
        return
    expected = _load_expected_lock(expected_path)
    expected_datasets = {
        item.get("id"): item
        for item in expected.get("datasets", [])
        if isinstance(item, dict) and item.get("id")
    }
    actual_datasets = {
        item.get("id"): item
        for item in lock.get("datasets", [])
        if isinstance(item, dict) and item.get("id")
    }
    for dataset_id, expected_item in expected_datasets.items():
        actual_item = actual_datasets.get(dataset_id)
        if actual_item is None:
            raise SourceInputError(f"expected lock dataset missing from output: {dataset_id}")
        for field in ("revision", "file_sha256", "row_count"):
            if field in expected_item and expected_item[field] != actual_item.get(field):
                raise SourceInputError(
                    f"expected lock mismatch for {dataset_id}.{field}: "
                    f"expected {expected_item[field]!r}, computed {actual_item.get(field)!r}"
                )


def build(args: argparse.Namespace) -> dict[str, Any]:
    if not SHA_RE.fullmatch(args.swe_gym_revision):
        raise SourceInputError("SWE-Gym revision must be a 40-character hex SHA")
    if not SHA_RE.fullmatch(args.openhands_revision):
        raise SourceInputError("OpenHands revision must be a 40-character hex SHA")
    if args.swe_gym_revision != SWE_GYM_REVISION:
        raise SourceInputError(f"unexpected SWE-Gym revision; expected {SWE_GYM_REVISION}")
    if args.openhands_revision != OPENHANDS_REVISION:
        raise SourceInputError(
            f"unexpected OpenHands revision; expected {OPENHANDS_REVISION}"
        )
    if args.limit is not None and args.limit < 0:
        raise SourceInputError("--limit must be non-negative")
    for spec, revision, name in (
        (args.swe_gym, args.swe_gym_revision, "SWE-Gym"),
        (args.openhands, args.openhands_revision, "OpenHands-SFT"),
    ):
        if _is_url(spec) and revision not in spec:
            raise SourceInputError(
                f"{name} download URL must contain the frozen revision {revision}"
            )
    swe_rows, swe_meta = load_rows(args.swe_gym, args.allow_download)
    openhands_rows, openhands_meta = load_rows(args.openhands, args.allow_download)
    join = exact_join(
        swe_rows, openhands_rows, args.split, args.limit, args.exclude_ambiguous
    )
    density = trajectory_density(join)
    lock = source_lock(
        swe_meta,
        openhands_meta,
        args.swe_gym_revision,
        args.openhands_revision,
        args.split,
        args.exclude_ambiguous,
    )
    verify_expected_lock(lock, args.expected_lock)
    result = {"source_lock": lock, "trajectory_density": density, "join_report": join}
    if not args.dry_run:
        if not args.output_dir:
            raise SourceInputError("--output-dir is required unless --dry-run is used")
        output_dir = Path(args.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "source-lock.yaml").write_text(
            "\n".join(_yaml_dump(lock)) + "\n", encoding="utf-8"
        )
        (output_dir / "trajectory-density.json").write_text(
            json.dumps(density, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        (output_dir / "join-report.json").write_text(
            json.dumps(join, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    build_parser = subparsers.add_parser("build", help="build D0 source reports")
    build_parser.add_argument("--swe-gym", required=True, help="local export or URL")
    build_parser.add_argument("--openhands", required=True, help="local export or URL")
    build_parser.add_argument("--output-dir", help="report directory")
    build_parser.add_argument("--allow-download", action="store_true")
    build_parser.add_argument("--dry-run", action="store_true")
    build_parser.add_argument(
        "--exclude-ambiguous",
        action="store_true",
        help="explicitly exclude ambiguous rows from admission",
    )
    build_parser.add_argument("--expected-lock", help="optional JSON/YAML lock to verify")
    build_parser.add_argument("--limit", type=int, help="analyze only this many OpenHands rows")
    build_parser.add_argument("--split", default=OPENHANDS_SPLIT)
    build_parser.add_argument("--swe-gym-revision", default=SWE_GYM_REVISION)
    build_parser.add_argument("--openhands-revision", default=OPENHANDS_REVISION)
    build_parser.set_defaults(func=build)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = args.func(args)
    except (OSError, SourceInputError) as exc:
        print(f"D0 source-lock error: {exc}", file=sys.stderr)
        return 2
    summary = {
        "fail_closed": result["join_report"]["fail_closed"],
        "join": result["join_report"]["summary"],
        "repos": result["trajectory_density"]["repos"],
        "written": not args.dry_run,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if not args.dry_run and summary["fail_closed"]:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
