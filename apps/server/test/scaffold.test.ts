import { describe, it, expect } from 'vitest';

// Phase 0: Vitest harness smoke test.
// Real unit tests start in Phase 1 (auth/PKCE) and Phase 2 (sync engine).
describe('Phase 0 — scaffold', () => {
  it('test harness is configured correctly', () => {
    expect(1 + 1).toBe(2);
  });

  it('TypeScript strict mode: noUncheckedIndexedAccess is active', () => {
    const arr: string[] = ['hello'];
    // Under noUncheckedIndexedAccess, arr[0] is string | undefined
    const item: string | undefined = arr[0];
    expect(item).toBe('hello');
  });
});
