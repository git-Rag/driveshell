/**
 * environment-origin.test.ts — Unit tests for production vs. dev origin security separation.
 */

import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../src/auth/session';

describe('Production vs Dev Origin Security Separation', () => {
  it('allows Vite dev server port (:5173) in development mode', () => {
    expect(isAllowedOrigin('http://localhost:5173', { isProduction: false })).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173', { isProduction: false })).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000', { isProduction: false })).toBe(true);
  });

  it('rejects Vite dev server port (:5173) in production mode', () => {
    expect(isAllowedOrigin('http://localhost:5173', { isProduction: true })).toBe(false);
    expect(isAllowedOrigin('http://127.0.0.1:5173', { isProduction: true })).toBe(false);
  });

  it('allows Tauri desktop origins in both dev and production', () => {
    expect(isAllowedOrigin('tauri://localhost', { isProduction: false })).toBe(true);
    expect(isAllowedOrigin('tauri://localhost', { isProduction: true })).toBe(true);
    expect(isAllowedOrigin('https://tauri.localhost', { isProduction: true })).toBe(true);
    expect(isAllowedOrigin('http://tauri.localhost', { isProduction: true })).toBe(true);
  });

  it('always rejects remote, malicious, or non-loopback origins', () => {
    const malicious = [
      'https://malicious.com',
      'http://attacker.com',
      'http://127.0.0.1.attacker.com',
      'http://localhost.evil.com',
      'http://192.168.1.100',
    ];

    for (const url of malicious) {
      expect(isAllowedOrigin(url, { isProduction: false })).toBe(false);
      expect(isAllowedOrigin(url, { isProduction: true })).toBe(false);
    }
  });
});
