#!/usr/bin/env python3
"""Build a pinned, metadata-only license manifest for a selected source pack.

All repository evidence is fetched from official GitHub raw/API URLs at each
task's exact base commit.  License bodies are hashed and classified in memory;
they are never written to the repository.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REPO_PATHS = {
    "getmoto/moto": ("getmoto", "moto"),
    "python/mypy": ("python", "mypy"),
    "pandas-dev/pandas": ("pandas-dev", "pandas"),
    "dask/dask": ("dask", "dask"),
    "iterative/dvc": ("iterative", "dvc"),
    "Project-MONAI/MONAI": ("Project-MONAI", "MONAI"),
}
ROOT_LICENSE_CANDIDATES = ("LICENSE", "LICENSE.txt", "COPYING", "COPYING.txt")
NOTICE_CANDIDATES = ("NOTICE", "NOTICE.txt")
ROOT_LICENSE_PATH = {
    "dask/dask": "LICENSE.txt",
}


@dataclass(frozen=True)
class FetchResponse:
    status: int
    body: bytes
    url: str
    error: str | None = None


Fetcher = Callable[[str], FetchResponse]


def fetch_url(url: str, timeout: int = 30) -> FetchResponse:
    for attempt in range(3):
        request = Request(url, headers={"User-Agent": "tdai-d0-source-lock/1"})
        try:
            with urlopen(request, timeout=timeout) as response:
                return FetchResponse(int(response.status), response.read(), url)
        except HTTPError as exc:
            try:
                body = exc.read()
            except OSError:
                body = b""
            response = FetchResponse(int(exc.code), body, url, str(exc))
            if response.status not in (429,) and response.status < 500:
                return response
        except (OSError, URLError) as exc:
            response = FetchResponse(0, b"", url, str(exc))
        if attempt < 2:
            time.sleep(0.2 * (attempt + 1))
    return response


def _raw_url(repo: str, commit: str, path: str) -> str:
    owner, name = REPO_PATHS[repo]
    return f"https://raw.githubusercontent.com/{owner}/{name}/{commit}/{path}"


def detect_spdx(body: bytes) -> str | None:
    text = body.decode("utf-8", errors="replace").lower()
    if "apache license" in text and "version 2" in text:
        return "Apache-2.0"
    if "mit license" in text:
        return "MIT"
    if "bsd 3-clause" in text or "redistribution and use in source and binary forms" in text and "neither the name" in text:
        return "BSD-3-Clause"
    if "bsd 2-clause" in text:
        return "BSD-2-Clause"
    if "python software foundation license" in text:
        return "PSF-2.0"
    return None


def _task_scope(tasks: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "count": len(tasks),
        "instance_ids": sorted(str(task["instance_id"]) for task in tasks),
        "roles": sorted({str(task.get("role", "")) for task in tasks}),
    }


def _condition_paths(repo: str, tasks: list[dict[str, Any]]) -> tuple[list[str], list[str], list[str]]:
    touched = [path for task in tasks for path in task.get("patch_touched_files", [])]
    paths: list[str] = []
    conditions: list[str] = []
    manual: list[str] = []
    if repo == "python/mypy" and any(path.startswith("mypy/typeshed/") for path in touched):
        paths.append("mypy/typeshed/LICENSE")
        conditions.append("touched mypy/typeshed path")
    if repo == "dask/dask" and any(path.startswith("dask/array/") for path in touched):
        paths.append("dask/array/NUMPY_LICENSE.txt")
        conditions.append("touched dask/array path")
    return list(dict.fromkeys(paths)), conditions, manual


def _record(
    *, repo: str, commit: str, path: str, response: FetchResponse,
    kind: str, required: bool, tasks: list[dict[str, Any]], condition: str | None = None,
    notice: bool = False, spdx: str | None = None,
) -> dict[str, Any]:
    record: dict[str, Any] = {
        "repo": repo,
        "base_commit": commit,
        "path": path,
        "url": response.url,
        "http_status": response.status,
        "sha256": hashlib.sha256(response.body).hexdigest() if response.status == 200 else None,
        "spdx": spdx if response.status == 200 else None,
        "notice": notice,
        "artifact_kind": kind,
        "required": required,
        "task_scope": _task_scope(tasks),
    }
    if condition:
        record["path_condition"] = condition
    if response.error:
        record["error"] = response.error
    return record


def build_manifest(
    source_pack: dict[str, Any], fetcher: Fetcher = fetch_url, *,
    probe_notice: bool = False, max_workers: int = 8,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    selected = source_pack.get("selected")
    if not isinstance(selected, list) or not selected:
        raise ValueError("source pack has no selected tasks")
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for task in selected:
        repo = task.get("repo")
        commit = task.get("base_commit")
        if repo not in REPO_PATHS or not isinstance(commit, str) or len(commit) != 40:
            raise ValueError(f"unsupported repo or invalid base_commit: {repo!r} {commit!r}")
        groups.setdefault((repo, commit), []).append(task)

    records: list[dict[str, Any]] = []
    blockers: list[dict[str, Any]] = []
    cache: dict[str, FetchResponse] = {}
    found_root: set[tuple[str, str]] = set()

    def get(url: str) -> FetchResponse:
        if url not in cache:
            cache[url] = fetcher(url)
        return cache[url]

    def get_many(urls: list[str]) -> None:
        pending = [url for url in dict.fromkeys(urls) if url not in cache]
        if not pending:
            return
        with ThreadPoolExecutor(max_workers=max(1, min(max_workers, 8))) as pool:
            futures = {pool.submit(fetcher, url): url for url in pending}
            for future in as_completed(futures):
                cache[futures[future]] = future.result()

    direct_urls: list[str] = []
    group_conditions: dict[tuple[str, str], tuple[list[str], list[str], list[str]]] = {}
    for (repo, commit), tasks in groups.items():
        group_conditions[(repo, commit)] = _condition_paths(repo, tasks)
        direct_urls.append(_raw_url(repo, commit, ROOT_LICENSE_PATH.get(repo, "LICENSE")))
        if probe_notice:
            for path in NOTICE_CANDIDATES:
                direct_urls.append(_raw_url(repo, commit, path))
        for path in group_conditions[(repo, commit)][0]:
            if path != "LICENSES":
                direct_urls.append(_raw_url(repo, commit, path))
    get_many(direct_urls)

    for (repo, commit), tasks in sorted(groups.items()):
        root_path = ROOT_LICENSE_PATH.get(repo, "LICENSE")
        root_paths = [root_path]
        root_response = get(_raw_url(repo, commit, root_path))
        if root_response.status != 200 and not (root_response.status == 0 or root_response.status == 429 or root_response.status >= 500):
            # Older revisions sometimes used a conventional alternate name;
            # probe fallbacks only after the repository's known path is absent.
            root_paths.extend(path for path in ROOT_LICENSE_CANDIDATES if path != root_path)
        for path in root_paths:
            response = get(_raw_url(repo, commit, path))
            if response.status == 200:
                found_root.add((repo, commit))
                if detect_spdx(response.body) is None:
                    blockers.append({"type": "unknown_spdx", "repo": repo, "base_commit": commit,
                                     "path": path})
            records.append(_record(repo=repo, commit=commit, path=path, response=response,
                                   kind="license" if path == root_path else "license_fallback",
                                   required=(path == root_path or response.status == 200), tasks=tasks,
                                   spdx=detect_spdx(response.body)))
        if probe_notice:
            for path in NOTICE_CANDIDATES:
                response = get(_raw_url(repo, commit, path))
                records.append(_record(repo=repo, commit=commit, path=path, response=response,
                                       kind="notice_candidate", required=False, tasks=tasks,
                                       notice=response.status == 200))
        condition_paths, conditions, manual_reasons = group_conditions[(repo, commit)]
        for condition_path in condition_paths:
            response = get(_raw_url(repo, commit, condition_path))
            condition = "touched mypy/typeshed path" if condition_path.startswith("mypy/") else "touched dask/array path"
            records.append(_record(repo=repo, commit=commit, path=condition_path, response=response,
                                   kind="conditional_license", required=True, tasks=tasks,
                                   condition=condition, spdx=detect_spdx(response.body)))
            if response.status != 200:
                blockers.append({"type": "missing_required_artifact", "repo": repo, "base_commit": commit,
                                 "path": condition_path})
            elif detect_spdx(response.body) is None:
                blockers.append({"type": "unknown_spdx", "repo": repo, "base_commit": commit,
                                 "path": condition_path})
        if (repo, commit) not in found_root:
            blockers.append({"type": "missing_required_artifact", "repo": repo, "base_commit": commit,
                             "path": "LICENSE", "reason": "no root license candidate returned HTTP 200"})
        for reason in manual_reasons:
            blockers.append({"type": "manual_review", "repo": repo, "base_commit": commit, "reason": reason})

    counts: dict[str, int] = {}
    for blocker in blockers:
        counts[blocker["type"]] = counts.get(blocker["type"], 0) + 1
    report = {
        "schema_version": "d0-license-report-v1",
        "source_pack": {
            "locator": source_pack.get("selection_source", {}).get("locator"),
            "sha256": source_pack.get("selection_source", {}).get("sha256"),
        },
        "selected_count": len(selected),
        "base_commit_count": len(groups),
        "manifest_record_count": len(records),
        "blocker_counts": counts,
        "blockers": blockers,
        "fail_closed": bool(blockers),
        "network_cache_entries": len(cache),
        "notice_probe": probe_notice,
        "coverage": {
            repo: {
                "task_count": sum(len(tasks) for (candidate_repo, _), tasks in groups.items() if candidate_repo == repo),
                "base_commit_count": sum(candidate_repo == repo for candidate_repo, _ in groups),
            }
            for repo in sorted({repo for repo, _ in groups})
        },
    }
    return records, report


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-pack", required=True)
    parser.add_argument("--output-manifest", required=True)
    parser.add_argument("--output-report", required=True)
    parser.add_argument("--probe-notice", action="store_true",
                        help="probe optional NOTICE candidates at each pinned commit")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        source_pack = json.loads(Path(args.source_pack).read_text(encoding="utf-8"))
        records, report = build_manifest(source_pack, probe_notice=args.probe_notice)
        manifest_path = Path(args.output_manifest)
        report_path = Path(args.output_report)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with manifest_path.open("w", encoding="utf-8", newline="\n") as handle:
            for record in records:
                handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"D0 license manifest error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({"manifest": str(Path(args.output_manifest)), "report": str(Path(args.output_report)),
                      "records": report["manifest_record_count"], "fail_closed": report["fail_closed"]}, ensure_ascii=False))
    return 3 if report["fail_closed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
