# SAST and DAST Implementation

This reference covers **Step 4 (implementation)** for Static (SAST) and Dynamic (DAST) Fortify findings. Complete all steps, then return to SKILL.md for the Completion Summary.

---

## Step 1: Apply Fixes

Implement fixes **one logical unit at a time** — don't apply all changes before verifying. A logical unit is typically one issue (or one set of instances of the same issue pattern in the same file).

After each change:

1. **Build** — confirm the project compiles/builds without errors. If the build breaks, investigate and fix the build error before touching anything else.
2. **Run tests** — if tests are fast and a runner is available, run them. Any newly failing test is a regression introduced by your change — investigate before continuing.
3. **Self-review** — re-read your change. Does it address the root cause? Does it handle edge cases the trace revealed? Does it match the surrounding code style?

If after implementation you realize a fix may be incomplete or incorrect — e.g., it compiles but doesn't fully address the root cause, or you discover the issue is more complex than planned — stop and tell the user rather than layering additional speculative changes.

---

## Step 2: Code Comment Guidelines

- Comment the **security intent** when it helps future maintainers understand *why* a particular pattern was used (e.g., `// Parameterized query — prevents SQL injection via untrusted user input`)
- Use comment density and style consistent with the surrounding code — don't over-document if the surrounding code is sparse
- **Never reference Fortify issue IDs, scan run dates, or Fortify product terminology** in source comments; comments should stand on their own merit

---

## Step 4 Completion Gate

Before returning to SKILL.md, verify:

- [ ] Every issue in the confirmed target set is either fixed or explicitly deferred with a reason
- [ ] The project builds without errors after all changes
- [ ] Tests pass (or any newly failing tests are investigated and explained to the user, not silently skipped)
- [ ] Each change was self-reviewed against the root cause and surrounding code style

Step 4 is complete. Return to SKILL.md for the Completion Summary.
