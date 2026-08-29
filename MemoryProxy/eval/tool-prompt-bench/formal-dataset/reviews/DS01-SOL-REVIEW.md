# DS01 Sol review: W01-B to T01 migration

## Decision

DS01 passes its migration Gate. The legacy W01-B material now exists as four
formal T01 pairs and eight formal Cases under the one-Space contract. This is a
partial T01 asset/case freeze for DS02, not the final forty-Case T01 Gate.

No model was run. No Luna batch was requested. No asset was restored through a
production service in this stage.

## Source and asset review

### Six retained L0 conversations

The immutable W01 input files remain the provenance source:

- `w01-b-fuzzing-context-pairs.json`: `b4bdf8f4bf1f8547bc84028489f38d0a6fe6c3390c0e1f6399ab50d77874d71a`
- `l0-sessions.json`: `749be097a0417d6e4876f6e5c0ef3847fa3a8aa098498fc06e3bda86b2dffe8c`
- source-pack selection: `0808508825dd04449c371a76d7e19fd1cdda9d1d9988902a663b6d8b6a84b345`

`W01-L0-07` through `W01-L0-12` are mapped to `T01-L0-07` through
`T01-L0-12`. Their original input/output hashes are preserved in
`provenance/T01.json`. Each formal L0 retains 12--40 source-ordered messages;
individual messages over 4 KB are excluded from the formal slice while the
full cleaned replay remains hash-addressed by its source evidence.

The earlier continuity/PII review supports the following admission boundary:

- `T01-L0-11` and `T01-L0-12`: approved as retrieval targets. The formal slices
  retain source message indexes 23/26/32/38 and 69/79/82 respectively.
- `T01-L0-07` through `T01-L0-10`: approved as L0-only same-Team distractors.
  They do not authorize an L1, L2, L3, or history-derived Skill.

### Pinned workspaces

The ujson workspace was inspected at
`8f23cce7929c49b9235d2f46ac9a403d051a9c95`. The archived tree SHA-256 is
`a556b0a171c8dd1c5017e3b182bf2f57bbd70ea9a38a39f99b347bb02a681bdf`
and the file-manifest SHA-256 is
`a89398e94c4256807c3f6e7580218b7bb9b885103e75f46e43d5090c07249dc9`.
`loads` is a public C-extension entry, invalid JSON raises the repository's
`JSONDecodeError`, and the tests cover text and byte-like inputs. The existing
`tests/fuzz.py` is a brute-force `dumps`/reference-count script; it does not
provide the requested Atheris `loads` harness, so it does not close the
Positive information gap.

The Mypy current workspace was inspected at
`d7b24514d7301f86031b7d1e2215cf8c2476bec0`. Its archived tree SHA-256 is
`81e0f38140de19704e5f7282d9028f9dcea00719d94a5292bb1c85d84afc3e3e`
and its file-manifest SHA-256 is
`e651c712b2d4a66cc032ca4d4311fc787c03dbf0688af108c1bbd06f5a712f33`.
The current checkout is context only; the requested prior implementation facts
are sourced solely from `T01-L0-11` and `T01-L0-12`.

### Imported Skills and visibility

The two packages were checked at SkillsBench v1.1 commit
`b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af`:

- [`discover-important-function/SKILL.md`](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/setup-fuzzing-py/environment/skills/discover-important-function/SKILL.md), SHA-256 `d935cc481fe8700ecfec482810dbf7fb56d0ee7e5fec7221ca5a77519d29ce29`.
- [`fuzzing-python/SKILL.md`](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/setup-fuzzing-py/environment/skills/fuzzing-python/SKILL.md), SHA-256 `718882130de22873f00e422d1c8d4d67febd002d5ee0163f314fea8890c0b835`.
- [`setup-fuzzing-py/task.md`](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/setup-fuzzing-py/task.md), SHA-256 `472891369b64fd18d2f435193e7f47c671043dbd92c07af5b6eb567905dd9b4a`.

The target-selection Skill is current-Agent owned and in the frozen listing;
its minimal chain is `skill_view`. The harness Skill is current-Agent owned but
not listed; it is available through the current-Agent search whitelist and its
minimal chain is `skill_search -> skill_view_by_id`. Both remain private to the
T01 Agent; no unsupported second BusinessAgent was invented.

## Pair and Gold review

For all four pairs, identity excluding the required fresh session id,
snapshot, workspace, language, difficulty, final query, and visible-asset hash
are identical. Exactly one context message differs, and its legacy
`delta_sha256` matches the formal `controlledDeltaSha256`.

Positive stop points are case-specific:

- target selection: stop after the listed package is returned by `skill_view`;
- harness design: stop after the searched package is returned by
  `skill_view_by_id`;
- stubgen history: stop after conversation search returns the target evidence
  in `T01-L0-11`;
- ParamSpec history: stop after conversation search returns the target evidence
  in `T01-L0-12`.

Every paired Negative contains the requested answer in the current context and
permits zero TDAI calls. The legacy global
`stop_after_first_tdai_tool_decision` string is absent from the formal
contract; the immutable input draft is not rewritten.

## Gate evidence and limits

- W01 draft validator: 4 pairs / 8 Cases passed.
- Formal validator: 8 T01 Cases, 4 pairs, 0 pair-integrity errors, 0 provider
  leaks, 0 invalid sequences, and 0 missing source references.
- Formal compiler: provider, private Gold, and Dev snapshot outputs were built
  twice with byte-identical file hashes.
- D0/DS01 regression: 29 TypeScript tests and 28 Python tests passed.
- Prompt-bench regression: 30 tests passed.
- Repository typecheck still reports the same 54 unrelated baseline errors;
  no error names a Task 1 or formal-dataset file.

DS02 must expand T01 from six to 8--12 L0 sessions, create/freeze the first
Knowledge asset and retrieval-pressure pilot, and grow T01 from 8 to 40 Cases.
