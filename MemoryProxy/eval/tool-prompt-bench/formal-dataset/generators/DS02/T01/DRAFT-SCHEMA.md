# Task 1 Luna draft schema

This schema is an authoring interchange only. It is not the formal registry
schema and grants no authority to set production visibility or final Gold.

## Pair batch

Write `draft.json` as UTF-8 JSON:

```json
{
  "schema_version": "task1.luna_pair_draft.v1",
  "batch_id": "string",
  "stage": "DS02 | DS03 | DS05",
  "team_id": "T01 | T02 | ... | T16",
  "family": "memory | skill | knowledge",
  "pairs": [
    {
      "draft_pair_id": "string",
      "external_source_ids": [],
      "synthetic_scope": ["team", "project", "conversation", "history"],
      "difficulty": "medium | hard",
      "context_bucket": "short_2_to_4 | medium_6_to_10 | long_12_to_18",
      "shared_context_messages": [
        { "role": "user | assistant", "content": "string" }
      ],
      "changed_message_index": 0,
      "query": "string",
      "positive": {
        "delta_message": { "role": "user | assistant", "content": "string" },
        "private_proposal": {
          "unique_information_gap": "author-only string",
          "route": "memory | skill | knowledge",
          "target_asset_ids": ["author-only string"],
          "allowed_sequence_candidates": [["author-only action names"]],
          "stop_after_candidate": "author-only string"
        }
      },
      "negative": {
        "delta_message": { "role": "user | assistant", "content": "string" },
        "private_proposal": {
          "route": "none",
          "why_current_context_is_sufficient": "author-only string"
        }
      },
      "visible_distractor_ids_author_only": ["string"],
      "controlled_delta_note": "string",
      "source_fact_map": [
        {
          "claim": "string",
          "source_id": "string",
          "locator": "string"
        }
      ],
      "sol_review_questions": ["string"]
    }
  ]
}
```

`shared_context_messages`, the selected `delta_message`, and `query` are the
only provider-visible candidate text. Author-only fields may name assets and
actions, but provider-visible text must not.

The Positive and Negative must have the same shared messages, final query,
identity assumptions, snapshot assumptions, and workspace. They differ only at
`changed_message_index`, where the Positive leaves one information gap and the
Negative supplies exactly that information.

## Natural-negative batch

Write `draft.json` with schema version
`task1.luna_natural_negative_draft.v1` and a `cases` array. Each case contains
`draft_case_id`, `difficulty`, `context_messages`, `query`,
`why_current_context_is_sufficient`, `visible_distractor_ids_author_only`,
`sol_review_questions`, optional `external_source_ids`, and optional
`source_fact_map`. It contains no tool suggestion.

## Generation manifest

Write `manifest.json` after `draft.json`:

```json
{
  "schema_version": "task1.luna_generation_manifest.v1",
  "generator_model": "gpt-5.6-luna",
  "reasoning_effort": "high",
  "prompt_version": "task1.luna-batch.v1",
  "batch_id": "string",
  "external_source_ids": [],
  "generated_at": "ISO-8601 timestamp with offset",
  "actual_count": 0
}
```

Also write `questions.md`, even if it only says that no open Sol decisions
remain. A generation-output hash is optional; the final dataset snapshot and
formal run inputs are hashed later by the compiler and runner.

`external_source_ids` may be empty. Team names, projects, conversations,
failure symptoms, timelines, L0/L1/L2/L3 and natural negatives may be
synthetic. Do not create fake source ids or claim synthetic details are facts
from an upstream repository. Source mapping is required only for directly
imported external Skill files or quoted source fragments.

## Formal staging provenance

After Sol review, every accepted formal `sourceEvidence` entry uses exactly one
of the following discriminated shapes:

- `provenanceKind: "synthetic"` records `generatorModel`, `reasoningEffort`,
  `promptVersion`, `batchId`, `generatedAt`, `reviewStatus: "reviewed"`, and
  non-empty `contentRefs`. It must not contain dataset, repository, revision,
  license, external path, or source hash fields.
- `provenanceKind: "external_import"` keeps the pinned dataset plus mandatory
  repository URL, 40-character revision, license, evidence path, evidence
  SHA-256, transform input hash, PII scan, and reviewer fields. Use it only for
  content actually imported from that source.

Both shapes retain the formal role, transform, world cutoff, and object
`contentHash`. Synthetic L1/Skill assets keep their message/session support
chain but do not invent code or test locators; external evidence retains those
locator gates.

Validate a batch with:

```text
node validate-luna-batch.mjs <batch-dir> <family> <expected-count> <team-id> <stage>
```

The final two arguments default to `T01` and `DS02` for compatibility with the
existing T01 drafts. A manifest may omit `raw_output_file` and
`raw_output_sha256`; when either field is present, the validator checks it.
