# DS02 Sol review: T01 retrieval-pressure pilot

## Decision

The three-family pilot passes. It proves that T01 can require real retrieval
without provider-visible tool hints and that each paired Negative closes
exactly the Positive information gap. Bulk Luna drafting may now begin under
the frozen batch boundary.

## Source correction made during review

The first generated fixture correctly captured the direct call at
`src/ujson/python/JSONtoObj.c:247` but used an unsupported decoder-definition
path and line. Sol rejected that evidence, checked the pinned git object, and
rebuilt the fixture with the verified definition at
`src/ujson/lib/ultrajsondec.c:790`. The contract and fixture were regenerated,
then formal validation and all real-interface tests were rerun successfully.
This is why the final pilot hashes differ from the initial authoring run.

## Visibility and pressure review

The Memory test uses the same production conversation-search implementation as
MemoryCore. The target is not alone: twelve same-Agent L0 sessions are loaded,
and `T01-L0-07` supplies a genuine close Mypy distractor while `T01-L0-12`
ranks first.

The Skill test uses the production SQLite skill store. The harness Skill is
not in listing, is allowed only in the same-Team search pool, and ranks first
for the natural harness query. Its complete sequence remains
`skill_search -> skill_view_by_id`.

The Knowledge test binds exactly three fixed ready resources through the
production route. Repository identity uniquely selects the ujson graph, while
the mypy graph and reliability wiki remain plausible fixed distractors. The
list is stable and the actual call adapter supplies the bound knowledge id to
`codegraph_callers`.

## Pair and Gold review

The pilot positives retain one private information gap apiece. Their negatives
add only the missing current-context fact and therefore require no TDAI call.
No provider-visible field names a Memory layer, asset id, Knowledge id, Gold,
or grading rationale. Gold sequences and `maxTdaiCalls` are case-specific and
compile exactly.

## Gate evidence and remaining work

- Formal validator: 10 T01 Cases, 5 pairs, and zero errors in all four required
  error classes.
- Retrieval-pressure test: 4/4 passed against production Memory, Skill, and
  Knowledge interfaces.
- Counts after pilot: 2 Memory positives, 2 Skill positives, 1 Knowledge
  positive, and their 5 paired negatives.
- DS02 remaining draft demand: 4 Memory pairs, 4 Skill pairs, 2 Knowledge
  pairs, and 10 natural negatives.

Every remaining authoring batch is delegated to `gpt-5.6-luna` with reasoning
`high`, a unique output directory, at most five pairs per pair batch, and no
permission to modify formal inputs, registries, schema, production code, or
Prompt variants. Sol will inspect raw output and write a per-batch decision
before any promotion.
