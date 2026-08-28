import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys_path = str(ROOT)
import sys

if sys_path not in sys.path:
    sys.path.insert(0, sys_path)
SPEC = importlib.util.spec_from_file_location("d0_license_manifest", ROOT / "build_license_manifest.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FixtureFetcher:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def __call__(self, url):
        self.calls.append(url)
        status, body = self.responses.get(url, (404, b""))
        return MODULE.FetchResponse(status=status, body=body, url=url)


class LicenseManifestTests(unittest.TestCase):
    def pack(self, tasks):
        return {
            "schema_version": "d0-source-pack-selection-v1",
            "selected_count": len(tasks),
            "selection_source": {"locator": "selection.md", "sha256": "a" * 64},
            "selected": tasks,
        }

    def task(self, repo, instance_id, commit, files):
        return {
            "instance_id": instance_id,
            "repo": repo,
            "base_commit": commit,
            "patch_touched_files": files,
        }

    def test_fetches_pinned_root_license_and_notice_without_storing_text(self):
        task = self.task("getmoto/moto", "moto-1", "1" * 40, ["moto/x.py"])
        root = "https://raw.githubusercontent.com/getmoto/moto/" + "1" * 40 + "/LICENSE"
        notice = "https://raw.githubusercontent.com/getmoto/moto/" + "1" * 40 + "/NOTICE"
        fetcher = FixtureFetcher({
            root: (200, b"MIT License\nCopyright 2024\n"),
            notice: (200, b"Attributions\n"),
        })
        records, report = MODULE.build_manifest(self.pack([task]), fetcher, probe_notice=True)
        self.assertFalse(report["fail_closed"])
        self.assertTrue(any(record["path"] == "LICENSE" and record["spdx"] == "MIT" for record in records))
        self.assertTrue(any(record["path"] == "NOTICE" and record["notice"] for record in records))
        self.assertNotIn("body", records[0])
        self.assertIn("1" * 40, fetcher.calls[0])

    def test_typeshed_and_numpy_conditions_are_required(self):
        tasks = [
            self.task("python/mypy", "mypy-1", "2" * 40, ["mypy/typeshed/stdlib/os.pyi"]),
            self.task("dask/dask", "dask-1", "3" * 40, ["dask/array/core.py"]),
        ]
        responses = {}
        responses["https://raw.githubusercontent.com/python/mypy/" + "2" * 40 + "/LICENSE"] = (200, b"Apache License Version 2.0")
        responses["https://raw.githubusercontent.com/dask/dask/" + "3" * 40 + "/LICENSE.txt"] = (200, b"Apache License Version 2.0")
        responses["https://raw.githubusercontent.com/python/mypy/" + "2" * 40 + "/mypy/typeshed/LICENSE"] = (200, b"MIT License")
        responses["https://raw.githubusercontent.com/dask/dask/" + "3" * 40 + "/dask/array/NUMPY_LICENSE.txt"] = (200, b"BSD 3-Clause License")
        records, report = MODULE.build_manifest(self.pack(tasks), FixtureFetcher(responses))
        self.assertFalse(report["fail_closed"])
        paths = {record["path"] for record in records if record["http_status"] == 200}
        self.assertIn("mypy/typeshed/LICENSE", paths)
        self.assertIn("dask/array/NUMPY_LICENSE.txt", paths)

    def test_unknown_required_license_fails_closed_but_returns_report(self):
        task = self.task("getmoto/moto", "moto-unknown", "4" * 40, ["moto/x.py"])
        url = "https://raw.githubusercontent.com/getmoto/moto/" + "4" * 40 + "/LICENSE"
        records, report = MODULE.build_manifest(
            self.pack([task]), FixtureFetcher({url: (200, b"Copyright only; no recognized license")})
        )
        self.assertTrue(report["fail_closed"])
        self.assertIn("unknown_spdx", report["blocker_counts"])
        self.assertTrue(any(record["spdx"] is None for record in records if record["path"] == "LICENSE"))

    def test_transient_root_failure_does_not_probe_fallback_names(self):
        task = self.task("getmoto/moto", "moto-transient", "5" * 40, ["moto/x.py"])
        root = "https://raw.githubusercontent.com/getmoto/moto/" + "5" * 40 + "/LICENSE"
        fetcher = FixtureFetcher({root: (0, b"")})
        records, report = MODULE.build_manifest(self.pack([task]), fetcher)
        self.assertTrue(report["fail_closed"])
        self.assertEqual(fetcher.calls, [root])
        self.assertEqual([record["path"] for record in records], ["LICENSE"])


if __name__ == "__main__":
    unittest.main()
