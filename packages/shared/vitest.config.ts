import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true, // Phase 0: no tests yet; real schemas start in Phase 1
  },
});
