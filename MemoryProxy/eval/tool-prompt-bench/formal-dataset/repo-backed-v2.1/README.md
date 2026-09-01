# Task 1 repo-backed 640-case projection

This is the active experiment projection of the immutable
`task1-data-formal-v2.1` 800-case source. It excludes T05, T06, T13 and T14
because those Teams reference `benchmark.invalid` repositories and have no
restorable local workspace.

Active counts:

- 16 Teams.
- 640 Cases: 320 Dev and 320 Hidden Test.
- 240 Tool-positive Cases.
- 240 paired No-tool Cases.
- 160 natural Coding Negative Cases.
- 240 Pair contracts: 120 Dev and 120 Hidden Test.

The existing 40-case Smoke preregistration is unchanged because it contains
only GitHub-backed Dev Cases.

`SELECTION.json` is generated together with the provider, private Gold, Pair
and runtime-binding projections by
`formal-dataset/scripts/build-repo-backed-projection.ts`.
