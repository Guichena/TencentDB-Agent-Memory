# Sol review questions

- Confirm this directory contains exactly one pair, `T09-DRAFT-SKILL-001`, and that its Positive route/target/stop fields use only the Sol-frozen listed target and the single `skill_view` action.
- Confirm the Positive and Negative share all eight context messages and the exact query, differing only at `changed_message_index: 8`; Positive preserves one workflow gap and Negative supplies precisely that workflow information.
- Confirm provider-visible text (shared messages, query, and selected delta) contains no tool names, Skill names, private IDs, Gold, or evaluation language. Author-only fields may retain source asset identifiers and action names.
- Confirm `asset-candidates.json` has all 14 source-lock entries, preserves each locked source path/revision/hash/role, and proposes only neutral `description`, `use_when`, and `do_not_use_when` boundaries without asserting final listing, Gold, or license authority.
- Confirm no raw source, staging area, contract, provider, snapshot, prompt code, configuration, or other batch directory was modified.
