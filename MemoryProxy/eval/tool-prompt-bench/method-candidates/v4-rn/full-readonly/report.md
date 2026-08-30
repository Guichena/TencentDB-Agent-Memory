# V4-RN no-model evidence

- Parent: `V3 / capability-pruned`
- Candidate profile: `neutral-symmetric`
- Capability: `memory=1;skill=1;knowledge=1;wiki=1;code_graph=1;skill_write=0;skill_extract=0`
- Tokenizer: `o200k_base`
- Renderer: `v4-rn.1`
- Behavioral metrics: not run; this report contains structure, token, contract, and hash evidence only.

## V3 inventory

| Family | Tool | Order | Fields | Characters | Tokens | Bias markers | Contrast targets |
| --- | --- | ---: | --- | ---: | ---: | --- | --- |
| skill | skill_search | 0 | path, body, when | 192 | 60 | none | none |
| skill | skill_view | 1 | path, body, when | 269 | 69 | must | none |
| skill | skill_view_by_id | 2 | path, body, when | 259 | 75 | must | none |
| skill | skill_files_read | 3 | path, body, when, avoid | 296 | 82 | must | none |
| skill | skill_files_download | 4 | path, body, response, when, avoid | 344 | 94 | must | none |
| knowledge | knowledge_tools_list | 5 | path, body, when | 233 | 55 | none | none |
| knowledge | knowledge_tools_call | 6 | path, body, when, avoid | 325 | 81 | must | none |
| memory | tdai_memory_search | 7 | path, body, when, contrast[tdai_conversation_search] | 316 | 76 | none | tdai_conversation_search |
| memory | tdai_atomic_query | 8 | path, body, when | 302 | 84 | none | none |
| memory | tdai_conversation_search | 9 | path, body, when, contrast[tdai_memory_search] | 361 | 85 | none | tdai_memory_search |
| memory | tdai_conversation_query | 10 | path, body, when | 205 | 58 | must | none |
| memory | tdai_scenario_ls | 11 | path, body, when | 189 | 57 | must | none |
| memory | tdai_read_scene | 12 | path, body, when, avoid | 304 | 85 | none | none |

V3's full-readonly cards use optional response/avoid/contrast rows rather than one sibling skeleton. The visible V3 contrasts cover only the atomic-memory/conversation-search pair. V4-RN renders the same seven fields on every visible card and supplies bidirectional registered edges for: `skill.search-vs-view-name`, `skill.search-vs-view-id`, `skill.view-name-vs-id`, `skill.file-read-vs-download`, `knowledge.list-vs-call`, `memory.atomic-vs-conversation-search`, `memory.atomic-search-vs-query`, `memory.conversation-search-vs-query`, `memory.scene-list-vs-read`.

## Card and component token ledger

| Family | Tool | V3 card tokens | V4-RN card tokens | Purpose | Use when | Limitations | Contrast | Required inputs | Returns | Execution | Contract-only length exception | Bias lint | Symmetry lint |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| skill | skill_search | 60 | 183 | 10 | 18 | 5 | 67 | 5 | 13 | 51 | no | pass | pass |
| skill | skill_view | 69 | 190 | 11 | 22 | 5 | 67 | 6 | 13 | 52 | no | pass | pass |
| skill | skill_view_by_id | 75 | 188 | 10 | 17 | 5 | 64 | 6 | 13 | 57 | no | pass | pass |
| skill | skill_files_read | 82 | 173 | 10 | 21 | 14 | 34 | 8 | 11 | 60 | no | pass | pass |
| skill | skill_files_download | 94 | 176 | 11 | 19 | 14 | 35 | 8 | 7 | 67 | no | pass | pass |
| knowledge | knowledge_tools_list | 55 | 140 | 11 | 21 | 5 | 32 | 6 | 12 | 38 | no | pass | pass |
| knowledge | knowledge_tools_call | 81 | 168 | 9 | 20 | 17 | 33 | 11 | 10 | 53 | no | pass | pass |
| memory | tdai_memory_search | 76 | 174 | 10 | 20 | 5 | 68 | 5 | 8 | 42 | no | pass | pass |
| memory | tdai_atomic_query | 84 | 170 | 11 | 18 | 5 | 34 | 5 | 12 | 69 | no | pass | pass |
| memory | tdai_conversation_search | 85 | 182 | 10 | 18 | 5 | 68 | 5 | 7 | 52 | no | pass | pass |
| memory | tdai_conversation_query | 58 | 147 | 11 | 14 | 5 | 36 | 5 | 10 | 49 | no | pass | pass |
| memory | tdai_scenario_ls | 57 | 143 | 8 | 19 | 5 | 36 | 5 | 10 | 43 | no | pass | pass |
| memory | tdai_read_scene | 85 | 166 | 11 | 16 | 14 | 35 | 5 | 9 | 60 | no | pass | pass |

Canonical component mask: `purpose+use-when+limitations+contrast+required-inputs+returns+execution`. Component counts encode each complete rendered field line independently; tokenizer boundary effects make their sum diagnostic rather than a substitute for whole-card or full-injection encoding.

## Deterministic full-injection capture

| Candidate | Full injection tokens | Delta vs V3 | SHA-256 run 1 | SHA-256 run 2 | Identical |
| --- | ---: | ---: | --- | --- | --- |
| V4-RN | 3463 | +1239 | `23284f3cef62f2a7e451f6656ddec449986399c6ccd7ec07cc3927b67fd8d21f` | `23284f3cef62f2a7e451f6656ddec449986399c6ccd7ec07cc3927b67fd8d21f` | yes |

Frozen V3 remains byte-identical at 2224 tokens and SHA-256 `625dba5f8a74df608c3fcabd92b9cc9aea191e4c1d14c89df70d28767587f607`. Tool ids, capability projection, contract ids, method/path/body/response facts, dynamic asset blocks, and canonical order are unchanged.
