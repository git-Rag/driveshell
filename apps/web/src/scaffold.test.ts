import { describe, it, expect } from 'vitest';

// Phase 0: web Vitest harness smoke test.
describe('Phase 0 — web scaffold', () => {
  it('test harness is configured correctly', () => {
    expect(typeof window).toBe('object'); // jsdom environment
  });
});
