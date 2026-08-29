# W01 L0 asset-candidate review

## Scope and decision rule

This is an audit of the twelve cleaned synthetic replays in
`drafts/l0-sessions.json`, read together with `W01-AUTHORING-PLAN.md` and the
locked source-pack metadata. It creates no Memory, Skill, Wiki, CodeGraph,
Case, Query, Gold, or tool-family asset. Message indexes below are zero-based
array indexes in the frozen replay, not upstream issue or PR locators.

An L1 in this review is only a *candidate*: it must be a small operational fact
whose replay message is corroborated by the source/base-commit code and a
pinned-test locator. A source trajectory labelled successful does not satisfy
that rule by itself. L2 and Skill require two independent cleaned sessions with
the same fact or reproducible procedure and failure boundary; a shared project
or a generic "inspect, edit, test" sequence is insufficient.

## Per-session continuity audit

| Session / locked source | Technical trajectory result | PII and clean-text result | Asset disposition |
| --- | --- | --- | --- |
| `W01-L0-01` / `getmoto__moto-5134` | Coherent after substantial harness churn: source inspection, event-pattern changes, then the focused replay test succeeds at message 98. The final evidence is narrow, not a general event-routing rule. | No email hit. No credential-redaction marker. | One narrow L1 candidate; no L2/Skill from this singleton. |
| `W01-L0-02` / `getmoto__moto-6567` | The response/model path is inspected, but the supposed repair is followed by repeated successful process exits that still print an empty response field (for example message 48). The observed contract is therefore not resolved. | Three credential-redaction occurrences are reviewed below. | **Blocked from promotion.** |
| `W01-L0-03` / `getmoto__moto-7365` | The numerical-type hypothesis and source edit are technically related, but every later temporary test run fails, including the terminal validation attempt. | No email or redaction hit. | No L1 until the pinned regression test is run successfully at the frozen base/repair boundary. |
| `W01-L0-04` / `getmoto__moto-5587` | The record starts with a reproduction and then makes many cleanup/finalizer edits. The last command is issued at message 99 with no recorded result; the chain has no verified end state. | No email or redaction hit. | No L1. The source-test locator may be retained only for a later independent re-audit. |
| `W01-L0-05` / `getmoto__moto-6585` | The response-shape edit is localized, but validation first makes the module syntactically invalid and then stops at an unrelated role-setup failure. No functional confirmation is recorded. | No email or redaction hit. | No L1. |
| `W01-L0-06` / `getmoto__moto-6913` | The initial payload-field localization is relevant, but the replay repeatedly changes a temporary mock harness and never reaches a passing assertion of stored payload behavior. | All email matches are `sender@example.com`/`recipient@example.com` in the temporary SESv2 example, rather than personal addresses; see below. | No L1. |
| `W01-L0-07` / `python__mypy-10424` | The checker/meet investigation is connected, but all recorded compiler reruns after edits fail through the final message. | No email or redaction hit. | No L1. |
| `W01-L0-08` / `python__mypy-5617` | The semantic-analysis edit is localized, but its only green check runs the temporary file with Python rather than through mypy. It does not exercise the changed analyzer. | No email or redaction hit. | No L1. |
| `W01-L0-09` / `python__mypy-15184` | The diagnostic-formatting path is correctly located and exercised several times. The final run emits an expected type error, but the retained output does not demonstrate the claimed ambiguous-name rendering. | No email or redaction hit. | Conditional only: rerun the pinned diagnostic fixture before treating it as L1. |
| `W01-L0-10` / `python__mypy-12943` | The replay diverts into a broad external clone; its proposed partial-type fallback is not validated against an in-repository focused test or recorded compiler result. | No email or redaction hit. | No L1. Do not preserve the proposed fallback as engineering guidance. |
| `W01-L0-11` / `python__mypy-16869` | Coherent: locate missing AST-printer handling, add the node case, then generate stubs successfully for the original, multiple, and mixed examples (messages 26, 32, 38). | No email or redaction hit. | One narrow L1 candidate. |
| `W01-L0-12` / `python__mypy-11567` | Coherent: locate the diff snapshot dispatch, add a missing node case, correct the optional-bound handling, and obtain a successful minimal snapshot at message 82. | No email or redaction hit. | One narrow L1 candidate. |

The audit therefore treats only L0-01, L0-11, and L0-12 as presently
evidence-backed L1 candidates. This is deliberately stricter than the earlier
authoring plan's statement that every history group might eventually yield L1.

## Email and credential review

### Email matches

All 67 retained email-pattern matches occur in `W01-L0-06`, messages 11--96:
48 occurrences of `sender@example.com` and 19 of `recipient@example.com`.
They are the two conventional `example.com` sender/recipient literals in a
temporary SESv2 reproduction. They are fixture/example data, not suspected
personal information. They do not need a fact-level redaction and must not be
used as an identity, contact, or asset field.

### Credential redactions

All three occurrences are in `W01-L0-02` and are repetitions of one logical
temporary database-creation argument:

| Replay message | Context retained after cleaning | Effect on factual use |
| --- | --- | --- |
| 13 | An assistant edit adds a required user field and a password-like argument to the temporary reproducer. | The exact parameter spelling/value is no longer reconstructible. It is not needed to state the high-level response-path investigation. |
| 14 | The editor echo repeats the same redacted argument. | Same logical redaction; not independent evidence. |
| 18 | A subsequent source listing repeats the redacted fragment while inspecting the model path. | Same logical redaction; it cannot support an exact runnable fixture. |

**Cleaning block:** because the redaction replaces part of an argument name as
well as its sensitive content, the L0-02 temporary reproducer is syntactically
and semantically incomplete. No future asset may claim that replay as an exact
reproduction or derive an assertion that depends on that omitted argument. This
does not require restoring the secret; use a fresh safe fixture if the RDS path
is reconsidered. The independent continuity failure in that session is an
additional reason it is not an L1 candidate.

## Evidence-backed atomic L1 candidates

These are selectors and audit notes, not asset bodies. The listed repository
tests are locked source-pack locators to run at the cited base commit before an
authoring step; they are not copied into a future Case.

| Candidate fact boundary | Replay evidence | Code and test locators to combine | Why it is atomic / limits |
| --- | --- | --- | --- |
| Presence semantics for an event-pattern leaf must distinguish an explicitly present null from an absent key. | `W01-L0-01`, message 33 localizes the distinction; message 98 records the focused replay test as passing. | `moto/events/models.py` (`EventPattern._does_item_match_named_filter` and `_does_event_match`); `tests/test_events/test_event_pattern.py`, with `tests/test_events/test_events_integration.py` as the source-pack companion. | Limited to the named predicate/presence boundary. It must not become a generic event-routing or AWS behavior claim. |
| A stub-generation alias printer needs an explicit star-expression rendering path to avoid a node-visitor failure. | `W01-L0-11`, message 23 supplies the localized edit; messages 26, 32, and 38 show successful generation across three minimal inputs. | `mypy/stubgen.py` (`AliasPrinter.visit_star_expr`); `mypy/test/teststubgen.py` and `test-data/unit/stubgen.test`. | Limited to alias rendering of that AST form; it says nothing about arbitrary TypeVarTuple semantics. |
| Incremental AST snapshotting must represent the parameter-specification node and tolerate an absent optional bound. | `W01-L0-12`, message 69 adds the node case, message 79 corrects optional handling, and message 82 records a successful snapshot. | `mypy/server/astdiff.py` (`snapshot_definition`); `test-data/unit/diff.test`. | Limited to snapshot serialization/normalization. It must not prescribe general server update behavior. |

`W01-L0-09` is intentionally absent from this table: message 37 identifies a
plausible formatter change in `mypy/messages.py`, and
`test-data/unit/check-assert-type-fail.test` is the locked test locator, but the
replay does not show the ambiguity-specific expected rendering. It remains a
re-audit candidate, not an L1 candidate.

## Two-session L2 / Skill audit

No L2 or Skill is authorized from the current evidence.

The only concrete cross-session lead is Mypy AST-node coverage:
`W01-L0-11` message 23 plus successful messages 26/32/38 adds a missing visitor
case, while `W01-L0-12` messages 69/79 plus successful message 82 adds and
normalizes a missing snapshot-dispatch case. They are independent source tasks,
base commits, and replays; their common operation is "locate an unhandled AST
variant, add an explicit representation branch, and verify it with a minimal
input." That is sufficient to nominate a *future review question*, but not an
L2 or Skill: the failure boundary differs (stub text generation versus
incremental snapshotting), and neither replay runs the pinned repository
regression fixture. A later promotion would need two cleaned records with the
same operation and failure boundary, plus pinned-fixture confirmation.

The Moto replays do not supply a second verified record matching L0-01's
presence-predicate operation. The response-contract group cannot be used as a
substitute because L0-02, L0-05, and L0-06 have no verified end state. In
particular, no generic response-debugging Skill may be inferred from failed
temporary harness iterations.

## Non-promotion register

- Do not treat temporary scripts, failed assertions, shell success exits, or a
  source trajectory's dataset success label as durable memory.
- Do not lift the credential-redacted L0-02 argument, example emails, absolute
  testbed paths, external clone instructions, or unverified fallback logic into
  a Memory or Skill.
- Do not merge different Moto services merely because they return responses, or
  different Mypy subsystems merely because they manipulate AST/type structures.
- Do not create an L3 profile: none of the replays evidences a durable human or
  BusinessAgent preference, and OpenHands remains provenance-only.
- Before any later asset authoring, rerun the cited pinned tests at each source
  base commit, record a safe cleaned locator, and re-check snapshot visibility
  under the W01 Team boundary.
