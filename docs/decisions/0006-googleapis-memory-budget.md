# ADR 0006 — googleapis type-load memory budget

**Date:** 2026-11-04  
**Status:** Accepted

## Context

`googleapis` ships 10 MB+ of TypeScript declaration files covering every Google API. When
`eslint --rule-type-aware` or `vitest` spawn child processes that each load the full type graph,
Node.js runs out of its default 1.5 GB heap before finishing.

Observed failures:

- `eslint` OOMed at ~2.1 GB during type-aware rule evaluation.
- `vitest` worker processes OOMed immediately on import of `googleapis`.

## Decision

1. Set `NODE_OPTIONS=--max-old-space-size=4096` (4 GB) for `pnpm lint`, `pnpm lint:fix`, and
   `pnpm test` in the server package, via `cross-env` for cross-platform consistency.
2. Set `pool: 'forks', singleFork: true` in `apps/server/vitest.config.ts` so all server tests run
   in one process instead of spawning one worker per file.
3. Add `NODE_OPTIONS=--max-old-space-size=4096` to the GitHub Actions CI step via `$GITHUB_ENV`
   before the lint/test steps.

## Rationale

- `cross-env` is the established solution for cross-platform env var injection in npm scripts. It is
  widely used and actively maintained.
- `singleFork` avoids the O(N) memory multiplication from parallel worker spawning.
- 4 GB is a safe ceiling; CI runners (ubuntu-latest, windows-latest) have 7 GB RAM.
- Alternative considered: exclude `googleapis` files from type-aware lint rules. Rejected because
  that would silently miss type errors in route handlers that call the Drive API.

## Consequences

- `pnpm lint` and `pnpm test` take slightly longer (single-process, more GC pressure).
- Dev machines need ≥ 6 GB free RAM to run lint comfortably.
- If `googleapis` is ever replaced with a lighter client (e.g., hand-rolled `fetch` wrappers against
  the Drive REST API), this ADR should be revisited.
