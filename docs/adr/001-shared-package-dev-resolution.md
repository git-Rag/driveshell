# ADR 001: Shared Package Resolution in Web Development

## Context

When running `pnpm dev`, Vite prebundles dependencies into `.vite/deps`. Previously,
`@driveshell/shared` resolved to `packages/shared/dist/index.js`. Because `packages/shared` builds
to CommonJS using TypeScript `__exportStar`, Vite's ESM analyzer could fail to resolve dynamically
re-exported named identifiers (e.g. `isRealMedia`), leading to:

```
Uncaught SyntaxError: The requested module '.../packages/shared/dist/index.js' doesn't provide an export named 'isRealMedia'
```

Furthermore, any changes to `packages/shared` required a manual build step
(`pnpm --filter @driveshell/shared build`) before the web client could see them, causing stale cache
and blank screen issues in development.

## Decision

We configure a Vite development alias in `apps/web/vite.config.ts`:

```ts
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
    '@driveshell/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
  },
}
```

We choose the Vite alias over `tsc --watch` because:

1. **Zero background processes**: Does not require running and managing a continuous `tsc --watch`
   daemon in development.
2. **Instant Hot Module Replacement (HMR)**: Vite handles TypeScript transpilation on the fly,
   immediately reflecting shared schema and helper edits in the browser without intermediate disk
   writes or file watcher lag.
3. **No stale dist dependency**: Developers never encounter blank screens due to forgotten `tsc`
   builds or stale `.vite` dependency caches.
4. **Production builds remain pure**: In production (`pnpm build`), root builds `@driveshell/shared`
   first, ensuring proper declaration generation (`.d.ts`) and typechecking across packages.

## Consequences

- `pnpm dev` operates seamlessly without requiring a prior build of `packages/shared`.
- All code in `packages/shared` must remain browser-compatible (no Node-only imports like `fs`,
  `path`, `crypto`, `Buffer`, or `process`), verified by
  `packages/shared/test/no-node-imports.test.ts`.
