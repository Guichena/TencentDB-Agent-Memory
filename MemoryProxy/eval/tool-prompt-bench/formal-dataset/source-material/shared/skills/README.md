# Shared Skill candidate library

This directory is a read-only candidate library for the five parallel dataset
construction tasks. Files here are not automatically visible to any Team and
are not formal Task 1 assets merely because they are present in the repository.

The library was assembled from two frozen upstream repositories:

- SkillsBench v1.1 at `b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af`, Apache-2.0.
- GitHub awesome-copilot at `f11a4e441c5ff061b4f8ae37952be8c602e4034e`, MIT.

Repository license texts are stored under `_licenses/`. The candidate and task
mapping is documented in `OPEN-SKILL-TARGET-MATRIX.md` and
`ENGINEERING-SKILL-CANDIDATE-RESEARCH.md`.

Before a construction task promotes a candidate into a Team asset, it must
identify the exact upstream path and revision, preserve any package-local
LICENSE or NOTICE, record whether the content was copied or adapted, and write
the accepted package into that Team's source-material directory. It does not
need to clone or test the upstream engineering repository merely to establish
Task 1 tool-routing Gold.
