# ADR 0001 — Monorepo with pnpm workspaces

**Date:** 2024  
**Status:** Accepted

## Context

DriveShell has three distinct packages: a Fastify server, a React web app, and a shared Zod schema
layer. We need a way to develop and build all three from one repository with shared tooling
(TypeScript, ESLint, Prettier) and the ability to cross-reference packages without publishing them
to npm.

## Decision

Use **pnpm workspaces** with three workspace roots: `apps/server`, `apps/web`, `packages/shared`.

## Rationale

- pnpm's symlinked `node_modules` are strict (no phantom dependencies) and fast.
- Workspace protocol (`workspace:*`) makes cross-package references first-class without publishing.
- Simpler than Turborepo or Nx for a project of this size; avoids build orchestration overhead at
  this stage.
- If the project grows, Turborepo can be layered on top of pnpm workspaces without restructuring.

## Consequences

- All `pnpm` commands must be run from the repo root or use `--filter` to target a workspace.
- `pnpm-lock.yaml` is a single file at the root; keep it committed.
