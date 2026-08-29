# DS02 T01 Luna draft schema

This schema is an authoring interchange only. It is not the formal registry
schema and grants no authority to set production visibility or final Gold.

## Pair batch

Write `draft.json` as UTF-8 JSON:

```json
{
  "schema_version": "task1.luna_pair_draft.v1",
  "batch_id": "string",
  "stage": "DS02",
  "team_id": "T01",
  "family": "memory | skill | knowledge",
  "pairs": [
    {
      "draft_pair_id": "string",
      "source_ids": ["string"],
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
`draft_case_id`, `source_ids`, `difficulty`, `context_messages`, `query`,
`why_current_context_is_sufficient`, `visible_distractor_ids_author_only`,
`source_fact_map`, and `sol_review_questions`. It contains no tool suggestion.

## Generation manifest

Write `manifest.json` after `draft.json`:

```json
{
  "schema_version": "task1.luna_generation_manifest.v1",
  "generator_model": "gpt-5.6-luna",
  "reasoning_effort": "high",
  "prompt_version": "task1.luna-batch.v1",
  "batch_id": "string",
  "input_source_ids": ["string"],
  "generated_at": "ISO-8601 timestamp with offset",
  "raw_output_file": "draft.json",
  "raw_output_sha256": "lowercase SHA-256 of the exact draft.json bytes",
  "actual_count": 0
}
```

Also write `questions.md`, even if it only says that no open Sol decisions
remain. Do not compute a hash over a file that contains its own hash.
