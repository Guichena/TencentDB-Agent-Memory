# DS02 retrieval-pressure pilot Gate

## Result

**Passed** on branch `codex/task1-data-t01-complete`.

This is the prerequisite Gate for Luna-assisted T01 bulk authoring. It is not
the final DS02 forty-Case Gate. The pilot was authored and reviewed by Sol;
there were no model runs and no Luna batches before this Gate passed.

## Frozen pilot surface

| Item | Result |
| --- | ---: |
| T01 L0 candidates | 12 |
| T01 Skills | 2 |
| ready Knowledge resources | 3 |
| total T01 pairs / Cases | 5 / 10 |
| pilot Memory / Skill / Knowledge pairs | 1 / 1 / 1 |
| model runs / Luna batches | 0 / 0 |

## Real-interface evidence

- Memory: the production SQLite FTS path searched all 12 visible L0 sessions
  with `ParamSpec optional bound`. `T01-L0-12` ranked first and the close
  Mypy bound/type distractor `T01-L0-07` remained in the returned set.
- Skill: `T01-SKILL-FUZZING-PYTHON` was absent from the frozen prewarm listing,
  present in same-Team search visibility, and ranked first through the
  production `SqliteSkillStore` BM25 search.
- Knowledge: the Agent bound exactly three fixed `ready` resources. Only
  `cg-t01ujs01` matched the active `ultrajson/ultrajson` workspace. The
  production route returned the stable nine-tool list, mapped `callers` to
  `codegraph_callers`, and returned `JSONToObj` at
  `src/ujson/python/JSONtoObj.c:247` for `JSON_DecodeObject`.
- Source verification: at ujson commit
  `8f23cce7929c49b9235d2f46ac9a403d051a9c95`, the decoder definition is
  `src/ujson/lib/ultrajsondec.c:790`, its exported declaration is
  `src/ujson/lib/ultrajson.h:353`, the direct call is
  `src/ujson/python/JSONtoObj.c:247`, and both `decode` and `loads` register
  `JSONToObj` in `src/ujson/python/ujson.c`.

## Gold and validation

The three complete positive sequences compile and execute with their
case-specific shortest stop points:

| Family | Positive Gold sequence | Negative |
| --- | --- | --- |
| Memory | `tdai_conversation_search` | zero TDAI calls |
| Skill | `skill_search -> skill_view_by_id` | zero TDAI calls |
| Knowledge | `knowledge_tools_list -> knowledge_tools_call` | zero TDAI calls |

Formal validation passed for 10 Cases and 5 pairs with zero provider leaks,
invalid sequences, missing source references, or pair-integrity errors. The
real retrieval-pressure test passed all four checks. Provider input, private
Gold, and snapshot input were then compiled twice with byte-identical files.

## Artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| formal contract, canonical | `da67389b9cebba62535b69ac6fe10807329b7c07237728ebfdf16b113926743b` |
| formal contract file | `b310f201e26cd5b751b613ad02ab290479a9985cb5a87a7aaf009b7af4be1ac1` |
| retrieval fixture file | `1aaf055129e473b8c64738bdbb74897b738e897d0c9b237ade640a558c33832f` |
| validation report file | `d94129ee334d54b07e303597a74a495b9f7789898c6a6ecc0c3f536bc89f3ed6` |
| retrieval-pressure test file | `874db0e8cf938e8f398e5817b5cc73d494c0a7f184745877f43331a9e689e7fd` |
| Dev provider JSONL file | `d5d81dd50346e633fa2da792b3638e107deae268a036888896418f4247b89c4c` |
| Dev private Gold JSONL file | `144dd4430a1ccca5a6c02fd6bad1ca20e5a54f89e5fdc6e297ad067c498eb0c8` |
| Dev snapshot-input file | `9165be68bc72e80daaa46e78d6d5d6c111d6bfe4e6b1383726aa01d6ffdf40cd` |

## Commands

```powershell
npm exec -- tsx eval/tool-prompt-bench/formal-dataset/generators/sol-ds02-pilot/build-pilot.ts
npm exec -- tsx eval/tool-prompt-bench/formal-dataset/scripts/validate-formal-dataset.ts `
  --contract eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json `
  --split dev `
  --report eval/tool-prompt-bench/formal-dataset/reports/DS02-PILOT-VALIDATION.json
npm exec -- vitest run src/__tests__/formal-dataset-retrieval-pressure.test.ts
npm exec -- tsx eval/tool-prompt-bench/formal-dataset/scripts/compile-formal-dataset.ts `
  --contract eval/tool-prompt-bench/formal-dataset/registry/contracts/formal-v1.json `
  --split dev `
  --out eval/tool-prompt-bench/formal-dataset
npm run eval:tool-prompt:d0:test
npm run eval:tool-prompt:test
```

## Authorized next step

The pilot Gate authorizes Luna draft generation in isolated batches of at most
five pairs. Luna may write only draft directories. Sol retains source,
visibility, Gold, validation, review, promotion, and merge authority.
