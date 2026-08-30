# D0 source lock tool

This directory contains a deliberately small, fail-closed source admission
tool. It locks the exact SWE-Gym and OpenHands-SFT revisions, hashes the local
input bytes, records row counts and fields, and writes three reports:

* `source-lock.yaml` — canonical revision-pinned parquet URL, optional local
  input, computed file SHA-256 and row counts.
* `trajectory-density.json` — only exact joined successful trajectories are
  counted by repository; each repo contains both raw matched counts and
  eligible counts using the longest trajectory per official task.
* `join-report.json` — one explicit `matched`, `ambiguous`, or `unmatched`
  record per OpenHands row, plus raw/eligible summaries and extracted-text
  evidence for fallback joins.

## Contract

The join first uses an explicit official `instance_id` in both inputs. For an
OpenHands row without that field, it extracts `<pr_description>` from the
first user message and applies only the documented normalization (CRLF/CR to
LF, `rstrip()` per line, then `strip()` overall). A normalized
`problem_statement` match is accepted only when globally unique; the output
then carries the extracted-text SHA-256 and the recovered official
`instance_id`. Repeated text is `ambiguous`. The tool never uses a
PR-description hash, message hash, repository path, or fuzzy match as a task
ID. If any successful row is ambiguous/unmatched, the report is
`fail_closed: true`; `--exclude-ambiguous` is an explicit, auditable policy
that permits only exact matched records to become eligible. Non-success rows
are reported but do not block admission.

SWE-Gym rows must contain a unique task ID and `repo`. OpenHands rows may use
`messages` or `trajectory`; system messages are excluded from the available
message count. The success split is assumed successful only when the split is
`train.success.oss`; an explicit `resolved` field is still honored.

The command accepts JSON, JSONL, and (when optional `pyarrow` is installed)
Parquet. Local files are the default. URLs are rejected unless the caller
explicitly supplies `--allow-download`; the tool never downloads a full source
by default.

## Usage

```powershell
python source_lock.py build `
  --swe-gym C:\exports\swe-gym.jsonl `
  --openhands C:\exports\openhands-success.jsonl `
  --output-dir .\reports\d0-source
```

Use `--dry-run --limit 10` for a bounded local validation. The revisions are
fixed by default and any other SHA is rejected:

* SWE-Gym: `bb94ed9e39bbeb96a7fcbfb533b80f25a7fd59cb`
* OpenHands-SFT: `4aaa5a4a4b5861f4799d2336908760c190ac3b17`

The formal locators in `source-lock.yaml` are the revision-pinned parquet
artifacts under those revisions (not a machine TEMP path); the local input is
recorded separately. `--expected-lock path.json` (or YAML with PyYAML) checks
the computed revision, `file_sha256`, and row count against a prior lock.

Use `--exclude-ambiguous` only after reviewing the listed ambiguous rows. A
non-dry-run command returns exit code 3 whenever the report remains
fail-closed; dry-runs return 0 after printing the bounded summary.

The fixture tests include exact problem-statement recovery, missing-ID cases,
and duplicate-ID/text ambiguity cases to prevent fuzzy or hash-only joins.

## Source-pack and license manifest

The final W01-W03 Markdown selection is compiled against the candidate
inventory; no selection metadata is hand-copied:

```powershell
python build_source_pack.py `
  --selection ..\source-locks\w01-w03\W01-W03-SOURCE-PACK-SELECTION.md `
  --inventory ..\source-locks\w01-w03\candidate-inventory.json `
  --output ..\source-locks\w01-w03\source-pack-selection.json
```

`build_license_manifest.py` fetches only official GitHub raw/API evidence at
each selected task's exact base commit. It records URL, path, HTTP status,
SHA-256, SPDX classification, optional NOTICE evidence, and task scope; it
never stores license text. The default run uses the repository's known root
license path and up to eight concurrent unique URL requests. Optional NOTICE
probing is explicit with `--probe-notice`. Dask `dask/array` and mypy
`mypy/typeshed` paths trigger their pinned auxiliary licenses. Pandas
`LICENSES` is intentionally not pulled for this source pack because no
selected touched path establishes a distributable third-party file; a future
workspace asset must add an explicit mapping before it can trigger such a
condition. A nonzero exit code is returned when the report is fail-closed,
while the manifest and report are still written for review.
