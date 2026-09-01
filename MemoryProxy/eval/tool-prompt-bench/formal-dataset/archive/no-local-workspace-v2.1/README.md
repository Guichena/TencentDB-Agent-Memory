# Archived cases without a restorable local workspace

This directory archives the records from T05, T06, T13 and T14 that were
removed from the active Task 1 model campaign. Their repository URLs use the
reserved `benchmark.invalid` domain, and no local project workspace exists for
Codex to inspect.

The immutable `task1-data-formal-v2.1` source remains unchanged. The generated
files here are the recoverable 160-case projection of that source. The active
counterpart is under `formal-dataset/repo-backed-v2.1/`.

Run the projection builder from `MemoryProxy`:

```powershell
.\node_modules\.bin\tsx.cmd eval\tool-prompt-bench\formal-dataset\scripts\build-repo-backed-projection.ts
```

Expected archive counts:

- Provider cases: 160 Hidden Test, 0 Dev.
- Private Gold: 160 Hidden Test, 0 Dev.
- Pair contracts: 60 Hidden Test, 0 Dev.
- Runtime case bindings: 160 Hidden Test, 0 Dev.

These cases are not eligible for the repo-backed campaign unless a real,
restorable project workspace is supplied later.
