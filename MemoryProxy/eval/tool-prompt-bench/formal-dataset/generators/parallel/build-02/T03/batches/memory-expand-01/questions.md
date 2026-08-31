# Sol review questions for t03-memory-expand-01

- Confirm that this batch contains exactly the five planned memory pairs MEM-02 through MEM-06 and deliberately excludes the trial pair MEM-01.
- Confirm plan-alias mappings to the real candidate IDs used in the private proposals: MEM-02 `T03-L1-GRPO-REWARD` → `T03-L1-TRL-REWARD-DIAGNOSTIC`; MEM-03 `T03-L0-MONAI-CACHE` → `T03-L0-MONAI-CACHE`; MEM-04 `T03-L1-SIMPO-METRIC` → `T03-L1-SIMPO-METRIC-SOURCE`; MEM-05 `T03-L1-DVC-RETENTION` → `T03-L1-DVC-RETENTION-BOUNDARY`; MEM-06 `T03-L2-GRPO-ROLLOUT` → `T03-L2-SCENE-TRL-SAMPLING-VS-REWARD`.
- Confirm that each shared context contains 10 messages, each positive and negative differs only in the appended final message, and every negative supplies only the one unresolved historical fact.
- Confirm that MEM-02 uses the reward-statistics/attribution gap, MEM-03 uses the cache-placement/recomputation gap, MEM-04 uses the metric-provenance gap, MEM-05 uses the cleanup-retention gap, and MEM-06 uses the rollout-scene timeline gap; the four project streams do not reuse one fault template with renamed terms.
- Confirm that every positive proposal names at least two real near-meaning distractors visible in the corresponding project history, while provider-visible text contains no internal candidate IDs, route names, endpoint strings, hierarchy labels, or evaluation labels.
- Confirm that all five records remain synthetic team/project/conversation history only and are drafts for Sol review; no candidate is final or production-visible here.
