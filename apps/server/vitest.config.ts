import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // googleapis is a very large package; running workers in a single forks pool
    // avoids spawning multiple Node processes that each try to load it simultaneously.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
